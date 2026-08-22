-- =============================================================================
-- PlaceGuard: Fix dynamic workflow blockers
-- 20260820020001_fix_workflow_and_open_drive_assessment.sql
--
-- Changes:
--   A. Clean fabricated seed-data round outcomes that have no backing
--      test_attempts record (pure fake data from seed_stage_cd.sql).
--      Real data (applications with actual test_attempts) is untouched.
--   B. create_assessment_for_round — allow assessment creation for 'open'
--      drives, not just 'draft'. Eligibility rules remain locked.
--   C. set_assessment_active — allow activation for 'open' drives.
--   D. get_my_application_rounds — add `round_id` (drive_rounds.id) to
--      the returned JSON so the frontend can call get_assessment_for_round
--      with the correct drive-round UUID.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A-1.  Reset fake terminal round statuses
--
--       Targets application_rounds rows whose status is terminal
--       (PASSED/FAILED/ABSENT/NOT_ATTEMPTED) but for which no test_attempts
--       row exists for that (drive_round, student) pair.
--
--       Uses a plain CTE-based UPDATE — no DO $$ block — to avoid the
--       PostgreSQL restriction on referencing the update-target alias
--       from inside nested subqueries in the FROM clause.
-- ─────────────────────────────────────────────────────────────────────────────

with fake_round_ids as (
  -- Identify application_round IDs that are fake (terminal status, no test evidence)
  select
    ar.id             as ar_id,
    dr.round_number   as round_number
  from public.application_rounds ar
  join public.drive_rounds dr  on dr.id = ar.round_id
  join public.applications  a  on a.id  = ar.application_id
  join public.students      s  on s.id  = a.student_id
  where ar.status in ('PASSED','FAILED','ABSENT','NOT_ATTEMPTED')
    and not exists (
      -- No real test_attempt exists for this (assessment, student) pair
      select 1
      from public.assessments   asmnt
      join public.test_attempts ta
        on  ta.assessment_id      = asmnt.id
        and ta.student_profile_id = s.profile_id
      where asmnt.drive_round_id = dr.id
    )
)
update public.application_rounds tgt
set
  status       = case
                   when fri.round_number = 1 then 'PENDING'::public.candidate_round_status
                   else 'LOCKED'::public.candidate_round_status
                 end,
  score        = null,
  feedback     = null,
  evaluated_by = null,
  evaluated_at = now()
from fake_round_ids fri
where tgt.id = fri.ar_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-2.  Reset application-level status for applications whose SELECTED/REJECTED
--       outcome was fabricated (no real test_attempts for that drive).
-- ─────────────────────────────────────────────────────────────────────────────

with fake_app_ids as (
  select a.id as app_id
  from public.applications a
  join public.students s on s.id = a.student_id
  where a.status in ('SELECTED','REJECTED')
    and not exists (
      select 1
      from public.drive_rounds  dr
      join public.assessments   asmnt on asmnt.drive_round_id = dr.id
      join public.test_attempts ta
        on  ta.assessment_id      = asmnt.id
        and ta.student_profile_id = s.profile_id
      where dr.drive_id = a.drive_id
    )
)
update public.applications tgt
set status = 'ELIGIBLE'
from fake_app_ids fai
where tgt.id = fai.app_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- D.  get_my_application_rounds — add `round_id` to returned JSON
--
--     `round_id` = ar.round_id = drive_rounds.id
--     Frontend needs this to call get_assessment_for_round(drive_rounds.id).
--     Previously the RPC only returned ar.id (application_round.id) as `id`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_my_application_rounds(p_application uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_student_id uuid;
  v_app        public.applications%rowtype;
  v_result     jsonb;
begin
  if auth.uid() is null or public.current_role() <> 'student' then
    raise exception 'Not authorized';
  end if;
  select id into v_student_id from public.students where profile_id = auth.uid();
  if not found then raise exception 'Student profile not found'; end if;

  select * into v_app from public.applications
    where id = p_application and student_id = v_student_id;
  if not found then raise exception 'Application not found or not yours'; end if;

  select jsonb_agg(
    jsonb_build_object(
      'id',             ar.id,
      'round_id',       ar.round_id,
      'round_number',   dr.round_number,
      'name',           dr.name,
      'round_type',     dr.round_type,
      'description',    dr.description,
      'is_elimination', dr.is_elimination,
      'max_score',      dr.max_score,
      'status',         ar.status,
      'score',          ar.score,
      'feedback',       case
                          when ar.status in ('PASSED','FAILED','ABSENT','NOT_ATTEMPTED')
                          then ar.feedback
                          else null
                        end,
      'evaluated_at',   ar.evaluated_at
    ) order by dr.round_number
  ) into v_result
  from public.application_rounds ar
  join public.drive_rounds dr on dr.id = ar.round_id
  where ar.application_id = p_application;

  return coalesce(v_result, '[]'::jsonb);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B.  create_assessment_for_round — allow 'open' drives
--
--     Original guard: drive_status <> 'draft'  → raise exception
--     New guard:      drive_status not in ('draft','open')  → raise exception
--     Eligibility rules remain locked once published; only the assessment-
--     authoring gate is relaxed.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_assessment_for_round(
  p_drive_round       uuid,
  p_title             text,
  p_instructions      text,
  p_duration_minutes  smallint,
  p_passing_score     numeric,
  p_negative_marking  boolean,
  p_negative_fraction numeric,
  p_shuffle_questions boolean,
  p_shuffle_options   boolean,
  p_allow_review      boolean
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_assessment    public.assessments%rowtype;
  v_drive_id      uuid;
  v_drive_status  public.drive_status;
begin
  if auth.uid() is null or public.current_role() <> 'company' then
    raise exception 'Not authorized';
  end if;

  select dr.drive_id, d.status
    into v_drive_id, v_drive_status
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where dr.id = p_drive_round;

  if v_drive_id is null or not public.is_company_owner(v_drive_id) then
    raise exception 'Round not found or not owned by your company';
  end if;

  if v_drive_status not in ('draft', 'open') then
    raise exception 'Assessments can only be configured while the drive is in draft or open status';
  end if;

  if exists (select 1 from public.assessments where drive_round_id = p_drive_round) then
    raise exception 'An assessment already exists for this round';
  end if;

  if length(trim(coalesce(p_title, ''))) < 2
     or p_duration_minutes is null
     or p_duration_minutes not between 1 and 360
  then
    raise exception 'Assessment title and duration are invalid';
  end if;

  if p_passing_score is not null and p_passing_score < 0 then
    raise exception 'Passing score cannot be negative';
  end if;

  if coalesce(p_negative_fraction, 0.25) < 0
     or coalesce(p_negative_fraction, 0.25) > 1
  then
    raise exception 'Negative marking fraction must be between 0 and 1';
  end if;

  insert into public.assessments(
    drive_round_id, title, instructions, duration_minutes, passing_score,
    negative_marking, negative_fraction, shuffle_questions, shuffle_options,
    allow_review, created_by
  ) values (
    p_drive_round,
    trim(p_title),
    coalesce(p_instructions, ''),
    p_duration_minutes,
    p_passing_score,
    coalesce(p_negative_marking, false),
    coalesce(p_negative_fraction, 0.25),
    coalesce(p_shuffle_questions, true),
    coalesce(p_shuffle_options, true),
    coalesce(p_allow_review, true),
    auth.uid()
  ) returning * into v_assessment;

  perform public.record_audit(
    'ASSESSMENT_CREATED', 'assessment', v_assessment.id, null,
    jsonb_build_object('drive_id', v_drive_id, 'drive_round_id', p_drive_round)
  );

  return to_jsonb(v_assessment);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C.  set_assessment_active — allow 'open' drives
--
--     Same relaxation as create_assessment_for_round above.
--     All authorization checks preserved.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_assessment_active(p_assessment uuid, p_is_active boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_assessment   public.assessments%rowtype;
  v_drive_id     uuid;
  v_drive_status public.drive_status;
  v_questions    integer;
begin
  if auth.uid() is null or public.current_role() <> 'company' then
    raise exception 'Not authorized';
  end if;

  select * into v_assessment
  from public.assessments where id = p_assessment for update;
  if not found then
    raise exception 'Assessment not found';
  end if;

  select dr.drive_id, d.status
    into v_drive_id, v_drive_status
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where dr.id = v_assessment.drive_round_id;

  if not public.is_company_owner(v_drive_id) then
    raise exception 'Assessment not found or not owned by your company';
  end if;

  if v_drive_status not in ('draft', 'open') then
    raise exception 'Assessment activation can only be changed while the drive is in draft or open status';
  end if;

  select count(*) into v_questions
  from public.assessment_questions where assessment_id = p_assessment;

  if p_is_active and v_questions = 0 then
    raise exception 'Add at least one question before activating an assessment';
  end if;

  update public.assessments set is_active = p_is_active
  where id = p_assessment returning * into v_assessment;

  perform public.record_audit(
    case when p_is_active then 'ASSESSMENT_ACTIVATED' else 'ASSESSMENT_DEACTIVATED' end,
    'assessment', p_assessment, null,
    jsonb_build_object('drive_id', v_drive_id, 'question_count', v_questions)
  );

  return to_jsonb(v_assessment);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Re-grant execute (CREATE OR REPLACE can strip grants in some Postgres configs)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  public.get_my_application_rounds(uuid),
  public.create_assessment_for_round(uuid, text, text, smallint, numeric, boolean, numeric, boolean, boolean, boolean),
  public.set_assessment_active(uuid, boolean)
to authenticated;
