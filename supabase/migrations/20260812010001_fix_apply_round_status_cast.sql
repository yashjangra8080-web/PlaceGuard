-- PlaceGuard: Fix apply_to_drive_result — candidate_round_status type mismatch
-- ============================================================
-- Root cause:
--   In PL/pgSQL, CASE WHEN ... THEN 'PENDING' ELSE 'LOCKED' END resolves the
--   result type as `text` (unknown-literal promotion). PostgreSQL cannot
--   implicitly coerce `text` to `candidate_round_status` in a VALUES clause
--   of a static INSERT, so it raises:
--     ERROR: column "status" is of type candidate_round_status
--            but expression is of type text
--
-- Fix: add explicit ::public.candidate_round_status casts on both CASE branches.
-- No schema changes. No data changes. One function replacement.
-- ============================================================

create or replace function public.apply_to_drive_result(p_drive uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_student       public.students%rowtype;
  v_rules         public.eligibility_rules%rowtype;
  v_drive         public.drives%rowtype;
  v_application_id uuid;
  v_audit_id      uuid;
  v_failed_rules  text[] := '{}';
  v_round         record;
begin
  if auth.uid() is null or public.current_role() <> 'student' then
    raise exception 'Not authorized';
  end if;
  select * into v_student from public.students where profile_id = auth.uid();
  if not found then
    v_audit_id := public.record_audit('STUDENT_PROFILE_MISSING', 'drive', p_drive,
      'Application blocked because the student record is missing.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, audit_commit_id, risk_score)
      values ('STUDENT_PROFILE_MISSING', 'HIGH',
              'A student account attempted to apply without a student record.',
              v_audit_id, 60);
    return jsonb_build_object('ok', false, 'message',
      'Your student profile has not been configured. Contact the placement office.');
  end if;
  select * into v_drive from public.drives where id = p_drive;
  if not found then
    v_audit_id := public.record_audit('INVALID_DRIVE_REFERENCE', 'drive', p_drive,
      'Application referenced a drive that does not exist.', '{}'::jsonb, 'BLOCKED');
    return jsonb_build_object('ok', false, 'message', 'Drive was not found.');
  end if;
  if v_drive.status <> 'open' or v_drive.deadline <= now() then
    v_audit_id := public.record_audit('DEADLINE_VIOLATION', 'drive', p_drive,
      'Application blocked: drive not open.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values ('LATE_APPLICATION_ATTEMPT', 'MEDIUM',
              'Application attempted for closed/expired drive.',
              p_drive, v_audit_id, 35);
    return jsonb_build_object('ok', false, 'message', 'Drive is not accepting applications.');
  end if;
  select * into v_rules from public.eligibility_rules where drive_id = p_drive;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Drive eligibility rules are unavailable.');
  end if;
  if exists(select 1 from public.applications
            where drive_id = p_drive and student_id = v_student.id) then
    return jsonb_build_object('ok', false, 'message', 'You have already applied to this drive.');
  end if;

  -- Eligibility checks
  if v_student.cgpa < v_rules.min_cgpa then
    v_failed_rules := array_append(v_failed_rules,
      format('CGPA %s is below required minimum %s.', v_student.cgpa, v_rules.min_cgpa));
  end if;
  if v_student.backlogs > v_rules.max_backlogs then
    v_failed_rules := array_append(v_failed_rules, 'Backlog limit exceeded.');
  end if;
  if not (lower(v_student.branch) = any(
      select lower(b) from unnest(v_rules.allowed_branches) b)) then
    v_failed_rules := array_append(v_failed_rules, 'Branch is not allowed.');
  end if;
  if exists(
    select 1 from unnest(v_rules.required_skills) sk
    where not lower(sk) = any(select lower(ss) from unnest(v_student.skills) ss)
  ) then
    v_failed_rules := array_append(v_failed_rules, 'Required skills are missing.');
  end if;

  if cardinality(v_failed_rules) > 0 then
    perform public.record_audit('ELIGIBILITY_CHECKED', 'drive', p_drive,
      array_to_string(v_failed_rules, ' '),
      jsonb_build_object('eligible', false), 'BLOCKED');
    return jsonb_build_object(
      'ok', false,
      'message', 'You do not meet the eligibility requirements.',
      'failedRules', v_failed_rules
    );
  end if;

  -- Create application
  insert into public.applications(drive_id, student_id, status)
    values (p_drive, v_student.id, 'ELIGIBLE') returning id into v_application_id;
  insert into public.eligibility_results(application_id, eligible, engine_version)
    values (v_application_id, true, '2.0.0');

  -- Initialise application_rounds for every configured round.
  -- Round 1 → PENDING (ready for evaluation); all others → LOCKED.
  -- FIX: explicit casts on both CASE branches prevent the
  --      "expression is of type text" error in PL/pgSQL static analysis.
  for v_round in
    select id, round_number from public.drive_rounds
    where drive_id = p_drive order by round_number
  loop
    insert into public.application_rounds(application_id, round_id, status)
      values (
        v_application_id,
        v_round.id,
        case when v_round.round_number = 1
             then 'PENDING'::public.candidate_round_status
             else 'LOCKED'::public.candidate_round_status
        end
      );
  end loop;

  perform public.record_audit('APPLICATION_SUBMITTED', 'application', v_application_id,
    null, jsonb_build_object('drive_id', p_drive));
  perform public.record_audit('ELIGIBILITY_CHECKED', 'application', v_application_id,
    null, jsonb_build_object('eligible', true));
  return jsonb_build_object('ok', true, 'applicationId', v_application_id);
end $$;

-- Re-apply grants (idempotent)
revoke all on function public.apply_to_drive_result(uuid) from public, anon;
grant execute on function public.apply_to_drive_result(uuid) to authenticated;
