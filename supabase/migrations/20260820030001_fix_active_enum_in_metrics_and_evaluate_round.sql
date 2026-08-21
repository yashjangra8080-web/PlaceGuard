-- =============================================================================
-- PlaceGuard: Fix invalid candidate_round_status 'ACTIVE' references
-- 20260820030001_fix_active_enum_in_metrics_and_evaluate_round.sql
--
-- Root cause:
--   'ACTIVE' exists in public.round_status (for drive_rounds.status) but NOT
--   in public.candidate_round_status (for application_rounds.status).
--   Two RPCs mistakenly used 'ACTIVE' in comparisons against
--   application_rounds.status (type: candidate_round_status). PostgreSQL
--   tries to cast the string literal to the enum and raises:
--
--     ERROR: invalid input value for enum candidate_round_status: "ACTIVE"
--
--   The correct existing enum value for "round is available to the student"
--   is 'PENDING' in candidate_round_status.
--
-- Fixes:
--   A. get_company_recruitment_metrics -- 'in_assessment' count used
--      ar.status in ('PENDING','ACTIVE') -- replaced with ar.status = 'PENDING'
--   B. evaluate_round -- guard used v_ar.status not in ('PENDING','ACTIVE')
--      -- replaced with v_ar.status <> 'PENDING'::public.candidate_round_status
--
--   No schema changes. No data changes. Two function replacements only.
-- =============================================================================

-- A. Fix get_company_recruitment_metrics
create or replace function public.get_company_recruitment_metrics()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_company_id uuid;
begin
  if auth.uid() is null or public.current_role() <> 'company' then
    raise exception 'Not authorized';
  end if;
  select id into v_company_id from public.companies where profile_id = auth.uid();
  if v_company_id is null then
    raise exception 'Company profile not found';
  end if;
  return jsonb_build_object(
    'drives',
      (select count(*) from public.drives where company_id = v_company_id),
    'open_drives',
      (select count(*) from public.drives where company_id = v_company_id and status = 'open'),
    'applications',
      (select count(*) from public.applications a
       join public.drives d on d.id = a.drive_id
       where d.company_id = v_company_id),
    'in_assessment',
      (select count(distinct a.id)
       from public.applications a
       join public.drives d on d.id = a.drive_id
       join public.application_rounds ar on ar.application_id = a.id
       where d.company_id = v_company_id
         and ar.status = 'PENDING'::public.candidate_round_status),
    'shortlisted',
      (select count(*) from public.applications a
       join public.drives d on d.id = a.drive_id
       where d.company_id = v_company_id and a.status = 'SHORTLISTED'),
    'selected',
      (select count(*) from public.applications a
       join public.drives d on d.id = a.drive_id
       where d.company_id = v_company_id and a.status = 'SELECTED'),
    'rejected',
      (select count(*) from public.applications a
       join public.drives d on d.id = a.drive_id
       where d.company_id = v_company_id and a.status = 'REJECTED')
  );
end $$;

-- B. Fix evaluate_round
create or replace function public.evaluate_round(
  p_application_round_id uuid,
  p_status               public.candidate_round_status,
  p_score                numeric default null,
  p_feedback             text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_ar         public.application_rounds%rowtype;
  v_round      public.drive_rounds%rowtype;
  v_app        public.applications%rowtype;
  v_next_round public.drive_rounds%rowtype;
  v_next_ar_id uuid;
  v_caller_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_caller_role := public.current_role();

  select * into v_ar from public.application_rounds
    where id = p_application_round_id for update;
  if not found then raise exception 'Application round not found'; end if;

  -- Only PENDING rounds can be evaluated.
  -- 'ACTIVE' is NOT a valid candidate_round_status; it belongs to round_status.
  if v_ar.status <> 'PENDING'::public.candidate_round_status then
    raise exception 'This round result has already been recorded or is locked';
  end if;

  select * into v_round from public.drive_rounds where id = v_ar.round_id;
  select * into v_app  from public.applications  where id = v_ar.application_id;

  if not (public.is_company_owner(v_app.drive_id) or public.is_staff()) then
    perform public.record_audit('UNAUTHORIZED_EVALUATION_ATTEMPT', 'application_round',
      p_application_round_id, 'Actor is not authorized to evaluate this round.',
      '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values (
        'UNAUTHORIZED_EVALUATION', 'HIGH',
        'Unauthorized evaluation attempt blocked.',
        v_app.drive_id,
        (select public.record_audit('UNAUTHORIZED_EVALUATION_ATTEMPT', 'application_round',
          p_application_round_id, null, '{}'::jsonb, 'BLOCKED')),
        75
      );
    raise exception 'Not authorized to evaluate this round';
  end if;

  if v_caller_role = 'student' then
    raise exception 'Students cannot evaluate rounds';
  end if;

  if p_score is not null and v_round.max_score is not null and p_score > v_round.max_score then
    raise exception 'Score % exceeds maximum score % for this round', p_score, v_round.max_score;
  end if;

  if p_status not in ('PASSED','FAILED','ABSENT','NOT_ATTEMPTED') then
    raise exception 'Invalid evaluation status. Use PASSED, FAILED, ABSENT, or NOT_ATTEMPTED';
  end if;

  update public.application_rounds
    set status       = p_status,
        score        = p_score,
        feedback     = p_feedback,
        evaluated_by = auth.uid(),
        evaluated_at = now()
    where id = p_application_round_id;

  if p_status = 'PASSED' then
    select dr.* into v_next_round
      from public.drive_rounds dr
      where dr.drive_id    = v_round.drive_id
        and dr.round_number = v_round.round_number + 1;

    if found then
      update public.application_rounds
        set status = 'PENDING'::public.candidate_round_status
        where application_id = v_ar.application_id
          and round_id        = v_next_round.id;
    else
      update public.applications set status = 'SELECTED'
        where id = v_ar.application_id;
      perform public.record_audit('CANDIDATE_SELECTED', 'application', v_ar.application_id,
        null, jsonb_build_object('drive_id', v_app.drive_id));
    end if;

  elsif p_status in ('FAILED', 'ABSENT') and v_round.is_elimination then
    update public.applications set status = 'REJECTED'
      where id = v_ar.application_id;
    perform public.record_audit('CANDIDATE_REJECTED_ROUND', 'application', v_ar.application_id,
      format('Failed round %s: %s', v_round.round_number, v_round.name),
      jsonb_build_object('round_id', v_round.id, 'drive_id', v_app.drive_id));
  end if;

  perform public.record_audit('ROUND_EVALUATED', 'application_round',
    p_application_round_id, p_feedback,
    jsonb_build_object(
      'round_id',       v_round.id,
      'round_number',   v_round.round_number,
      'drive_id',       v_app.drive_id,
      'application_id', v_ar.application_id,
      'status',         p_status,
      'score',          p_score
    ));

  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

grant execute on function
  public.get_company_recruitment_metrics(),
  public.evaluate_round(uuid, public.candidate_round_status, numeric, text)
to authenticated;