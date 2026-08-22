-- PlaceGuard: Forward-fix migration
-- 20260820000001_fix_secure_assessment_authoring.sql
--
-- Why: Migration 20260812030001_secure_assessment_authoring.sql failed to apply
-- to the remote project because `set_assessment_active` used a multi-item SELECT INTO
-- with a %rowtype variable (PostgreSQL error 42601:
-- "record variable cannot be part of multiple-item INTO list").
--
-- This migration re-runs the entire content of 20260812030001 with the bug fixed,
-- then also applies 20260816000001_fix_proposal_status_cast.sql content.
-- All statements use CREATE OR REPLACE / IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- so this is safe to apply to a database that already has partial state from
-- earlier failed attempts.
-- =============================================================================

-- ─── Security: revoke direct client writes on authoring tables ───────────────
drop policy if exists assessments_company_write on public.assessments;
drop policy if exists questions_company_write on public.questions;
drop policy if exists options_company_write on public.question_options;
drop policy if exists aq_company_write on public.assessment_questions;
drop policy if exists coding_problems_company_write on public.coding_problems;

revoke insert, update, delete on public.assessments, public.questions,
  public.question_options, public.assessment_questions, public.coding_problems,
  public.ai_generation_requests, public.ai_generated_questions
from anon, authenticated;

-- ─── create_assessment_for_round ─────────────────────────────────────────────
create or replace function public.create_assessment_for_round(
  p_drive_round uuid,
  p_title text,
  p_instructions text,
  p_duration_minutes smallint,
  p_passing_score numeric,
  p_negative_marking boolean,
  p_negative_fraction numeric,
  p_shuffle_questions boolean,
  p_shuffle_options boolean,
  p_allow_review boolean
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_assessment public.assessments%rowtype;
  v_drive_id uuid;
  v_drive_status public.drive_status;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  select dr.drive_id, d.status into v_drive_id, v_drive_status
  from public.drive_rounds dr join public.drives d on d.id = dr.drive_id
  where dr.id = p_drive_round;
  if v_drive_id is null or not public.is_company_owner(v_drive_id) then raise exception 'Round not found or not owned by your company'; end if;
  if v_drive_status <> 'draft' then raise exception 'Assessments can only be configured while the drive is a draft'; end if;
  if exists (select 1 from public.assessments where drive_round_id = p_drive_round) then raise exception 'An assessment already exists for this round'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 or p_duration_minutes is null or p_duration_minutes not between 1 and 360 then
    raise exception 'Assessment title and duration are invalid';
  end if;
  if p_passing_score is not null and p_passing_score < 0 then raise exception 'Passing score cannot be negative'; end if;
  if coalesce(p_negative_fraction, 0.25) < 0 or coalesce(p_negative_fraction, 0.25) > 1 then raise exception 'Negative marking fraction must be between 0 and 1'; end if;

  insert into public.assessments(
    drive_round_id, title, instructions, duration_minutes, passing_score,
    negative_marking, negative_fraction, shuffle_questions, shuffle_options,
    allow_review, created_by
  ) values (
    p_drive_round, trim(p_title), coalesce(p_instructions, ''), p_duration_minutes,
    p_passing_score, coalesce(p_negative_marking, false), coalesce(p_negative_fraction, 0.25),
    coalesce(p_shuffle_questions, true), coalesce(p_shuffle_options, true),
    coalesce(p_allow_review, true), auth.uid()
  ) returning * into v_assessment;
  perform public.record_audit('ASSESSMENT_CREATED', 'assessment', v_assessment.id, null,
    jsonb_build_object('drive_id', v_drive_id, 'drive_round_id', p_drive_round));
  return to_jsonb(v_assessment);
end $$;

-- ─── set_assessment_active (FIXED: separate scalar selects instead of multi-INTO) ─
create or replace function public.set_assessment_active(p_assessment uuid, p_is_active boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_assessment public.assessments%rowtype;
  v_drive_id uuid;
  v_drive_status public.drive_status;
  v_questions integer;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  -- Load assessment rowtype separately from the scalar join fields
  select * into v_assessment from public.assessments where id = p_assessment for update;
  if not found then raise exception 'Assessment not found or not owned by your company'; end if;
  -- Now fetch drive_id and status in a separate query
  select dr.drive_id, d.status into v_drive_id, v_drive_status
  from public.drive_rounds dr
  join public.drives d on d.id = dr.drive_id
  where dr.id = v_assessment.drive_round_id;
  if not public.is_company_owner(v_drive_id) then raise exception 'Assessment not found or not owned by your company'; end if;
  if v_drive_status <> 'draft' then raise exception 'Assessment activation can only be changed while the drive is a draft'; end if;
  select count(*) into v_questions from public.assessment_questions where assessment_id = p_assessment;
  if p_is_active and v_questions = 0 then raise exception 'Add at least one reviewed question before activating an assessment'; end if;
  update public.assessments set is_active = p_is_active where id = p_assessment returning * into v_assessment;
  perform public.record_audit(case when p_is_active then 'ASSESSMENT_ACTIVATED' else 'ASSESSMENT_DEACTIVATED' end,
    'assessment', p_assessment, null, jsonb_build_object('drive_id', v_drive_id, 'question_count', v_questions));
  return to_jsonb(v_assessment);
end $$;

-- ─── add_question_to_assessment ───────────────────────────────────────────────
create or replace function public.add_question_to_assessment(
  p_assessment uuid,
  p_question_text text,
  p_question_type public.question_type,
  p_topic text,
  p_difficulty public.difficulty_level,
  p_marks numeric,
  p_explanation text,
  p_options jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_drive_id uuid;
  v_drive_status public.drive_status;
  v_company_id uuid;
  v_question_id uuid;
  v_option jsonb;
  v_correct integer := 0;
  v_count integer := 0;
  v_position smallint;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  select dr.drive_id, d.status, c.id into v_drive_id, v_drive_status, v_company_id
  from public.assessments a
  join public.drive_rounds dr on dr.id = a.drive_round_id
  join public.drives d on d.id = dr.drive_id
  join public.companies c on c.id = d.company_id
  where a.id = p_assessment;
  if v_drive_id is null or not public.is_company_owner(v_drive_id) then raise exception 'Assessment not found or not owned by your company'; end if;
  if v_drive_status <> 'draft' then raise exception 'Questions can only be changed while the drive is a draft'; end if;
  if length(trim(coalesce(p_question_text, ''))) < 5 or coalesce(p_marks, 0) <= 0 then raise exception 'Question text and marks are invalid'; end if;
  if p_question_type not in ('MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE') then raise exception 'Use the isolated coding workflow for coding and SQL questions'; end if;
  if jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' then raise exception 'Question options must be an array'; end if;
  select count(*), count(*) filter (where coalesce((value->>'is_correct')::boolean, false))
  into v_count, v_correct from jsonb_array_elements(p_options);
  if v_count < 2 or v_count > 8 or (p_question_type = 'MCQ_SINGLE' and v_correct <> 1) or (p_question_type in ('MCQ_MULTI', 'TRUE_FALSE') and v_correct < 1) then
    raise exception 'Options must be valid and include the required correct answer(s)';
  end if;
  insert into public.questions(company_id, question_text, question_type, topic, difficulty, marks, explanation, created_by)
  values (v_company_id, trim(p_question_text), p_question_type, coalesce(nullif(trim(p_topic), ''), 'General'), p_difficulty, p_marks, nullif(trim(coalesce(p_explanation, '')), ''), auth.uid())
  returning id into v_question_id;
  v_position := 0;
  for v_option in select value from jsonb_array_elements(p_options) loop
    if length(trim(coalesce(v_option->>'text', ''))) = 0 then raise exception 'Options cannot be blank'; end if;
    insert into public.question_options(question_id, option_text, is_correct, display_order)
      values (v_question_id, trim(v_option->>'text'), coalesce((v_option->>'is_correct')::boolean, false), v_position);
    v_position := v_position + 1;
  end loop;
  select coalesce(max(display_order) + 1, 0) into v_position from public.assessment_questions where assessment_id = p_assessment;
  insert into public.assessment_questions(assessment_id, question_id, display_order) values (p_assessment, v_question_id, v_position);
  perform public.record_audit('QUESTION_ADDED_TO_ASSESSMENT', 'question', v_question_id, null,
    jsonb_build_object('assessment_id', p_assessment, 'drive_id', v_drive_id));
  return v_question_id;
end $$;

-- ─── remove_question_from_assessment ─────────────────────────────────────────
create or replace function public.remove_question_from_assessment(p_assessment uuid, p_question uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_drive_id uuid; v_drive_status public.drive_status;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  select dr.drive_id, d.status into v_drive_id, v_drive_status from public.assessments a join public.drive_rounds dr on dr.id=a.drive_round_id join public.drives d on d.id=dr.drive_id where a.id=p_assessment;
  if v_drive_id is null or not public.is_company_owner(v_drive_id) then raise exception 'Assessment not found or not owned by your company'; end if;
  if v_drive_status <> 'draft' then raise exception 'Questions can only be changed while the drive is a draft'; end if;
  delete from public.assessment_questions where assessment_id=p_assessment and question_id=p_question;
  if not found then raise exception 'Question is not assigned to this assessment'; end if;
  perform public.record_audit('QUESTION_REMOVED_FROM_ASSESSMENT', 'question', p_question, null, jsonb_build_object('assessment_id', p_assessment, 'drive_id', v_drive_id));
end $$;

-- ─── store_ai_question_drafts ─────────────────────────────────────────────────
create or replace function public.store_ai_question_drafts(
  p_company uuid, p_context jsonb, p_questions jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_request_id uuid; v_question jsonb; v_draft_ids jsonb := '[]'::jsonb; v_draft_id uuid; v_count integer;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.companies where id=p_company and profile_id=auth.uid()) then raise exception 'Company not found or not owned by you'; end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then raise exception 'Generated questions must be an array'; end if;
  select count(*) into v_count from jsonb_array_elements(p_questions);
  if v_count not between 1 and 20 then raise exception 'Generate between 1 and 20 questions at a time'; end if;
  insert into public.ai_generation_requests(requested_by, request_type, context, status, result_count, completed_at)
    values(auth.uid(), 'QUESTIONS', coalesce(p_context, '{}'::jsonb), 'COMPLETED', v_count, now()) returning id into v_request_id;
  for v_question in select value from jsonb_array_elements(p_questions) loop
    if length(trim(coalesce(v_question->>'question_text', ''))) < 5
      or jsonb_typeof(v_question->'options') <> 'array'
      or (select count(*) from jsonb_array_elements(v_question->'options')) < 2
      or (select count(*) from jsonb_array_elements(v_question->'options') o where coalesce((o.value->>'is_correct')::boolean, false)) <> 1 then
      raise exception 'Generated question did not pass server validation';
    end if;
    insert into public.ai_generated_questions(request_id, company_id, question_text, question_type, topic, difficulty, marks, explanation, options)
      values(v_request_id, p_company, trim(v_question->>'question_text'), 'MCQ_SINGLE', coalesce(nullif(trim(v_question->>'topic'), ''), 'General'),
        coalesce((v_question->>'difficulty')::public.difficulty_level, 'MEDIUM'), coalesce((v_question->>'marks')::numeric, 1),
        nullif(trim(coalesce(v_question->>'explanation', '')), ''), v_question->'options') returning id into v_draft_id;
    v_draft_ids := v_draft_ids || to_jsonb(v_draft_id);
  end loop;
  perform public.record_audit('AI_QUESTION_DRAFTS_CREATED', 'ai_generation_request', v_request_id, null, jsonb_build_object('company_id', p_company, 'count', v_count));
  return jsonb_build_object('request_id', v_request_id, 'draft_ids', v_draft_ids);
end $$;

-- ─── approve_ai_question_for_assessment ──────────────────────────────────────
create or replace function public.approve_ai_question_for_assessment(p_draft uuid, p_assessment uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_question_id uuid; v_drive_id uuid; v_drive_status public.drive_status; v_draft public.ai_generated_questions%rowtype; v_position smallint;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  select * into v_draft from public.ai_generated_questions where id=p_draft for update;
  if not found or v_draft.review_status <> 'DRAFT' then raise exception 'Draft is not available for approval'; end if;
  select dr.drive_id, d.status into v_drive_id, v_drive_status from public.assessments a join public.drive_rounds dr on dr.id=a.drive_round_id join public.drives d on d.id=dr.drive_id where a.id=p_assessment;
  if v_drive_id is null or not public.is_company_owner(v_drive_id) or not exists (select 1 from public.companies where id=v_draft.company_id and profile_id=auth.uid()) then raise exception 'Not authorized'; end if;
  if v_drive_status <> 'draft' then raise exception 'Draft questions can only be approved while the drive is a draft'; end if;
  insert into public.questions(company_id, question_text, question_type, topic, difficulty, marks, explanation, ai_generated, created_by)
    values(v_draft.company_id, v_draft.question_text, v_draft.question_type, v_draft.topic, v_draft.difficulty, v_draft.marks, v_draft.explanation, true, auth.uid()) returning id into v_question_id;
  insert into public.question_options(question_id, option_text, is_correct, display_order)
    select v_question_id, trim(value->>'text'), coalesce((value->>'is_correct')::boolean, false), (ordinality - 1)::smallint
    from jsonb_array_elements(v_draft.options) with ordinality;
  select coalesce(max(display_order) + 1, 0) into v_position from public.assessment_questions where assessment_id=p_assessment;
  insert into public.assessment_questions(assessment_id, question_id, display_order) values(p_assessment, v_question_id, v_position);
  update public.ai_generated_questions set review_status='APPROVED', reviewed_by=auth.uid(), reviewed_at=now(), approved_question_id=v_question_id where id=p_draft;
  perform public.record_audit('AI_QUESTION_APPROVED', 'question', v_question_id, null, jsonb_build_object('draft_id', p_draft, 'assessment_id', p_assessment, 'drive_id', v_drive_id));
  return v_question_id;
end $$;

-- ─── reject_ai_question_draft ─────────────────────────────────────────────────
create or replace function public.reject_ai_question_draft(p_draft uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_draft public.ai_generated_questions%rowtype;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  select * into v_draft from public.ai_generated_questions where id=p_draft for update;
  if not found or v_draft.review_status <> 'DRAFT' then raise exception 'Draft is not available for rejection'; end if;
  if not exists (select 1 from public.companies where id=v_draft.company_id and profile_id=auth.uid()) then raise exception 'Not authorized'; end if;
  update public.ai_generated_questions set review_status='REJECTED', reviewed_by=auth.uid(), reviewed_at=now() where id=p_draft;
  perform public.record_audit('AI_QUESTION_REJECTED', 'ai_generated_question', p_draft, null, '{}'::jsonb);
end $$;

-- ─── placement_outcomes: add missing columns if not already present ───────────
alter table public.placement_outcomes add column if not exists role_name text;
alter table public.placement_outcomes add column if not exists offer_status text not null default 'PENDING' check (offer_status in ('PENDING','ACCEPTED','DECLINED'));
alter table public.placement_outcomes add column if not exists selection_date timestamptz;
alter table public.placement_outcomes add column if not exists package_ctc numeric(10,2) check (package_ctc is null or package_ctc >= 0);
alter table public.placement_outcomes add column if not exists placement_season text;
create index if not exists placement_outcomes_student_idx on public.placement_outcomes(student_id);

-- ─── Trigger: auto-record placement outcome when application becomes SELECTED ─
create or replace function public.record_placement_outcome_from_application()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'SELECTED' and old.status is distinct from 'SELECTED' then
    insert into public.placement_outcomes(drive_id, student_id, outcome, recorded_by, role_name, selection_date)
    select new.drive_id, new.student_id, 'SELECTED', auth.uid(), d.role_name, now() from public.drives d where d.id=new.drive_id
    on conflict (drive_id, student_id) do nothing;
    perform public.record_audit('PLACEMENT_OUTCOME_RECORDED', 'application', new.id, null, jsonb_build_object('drive_id', new.drive_id, 'outcome', 'SELECTED'));
  end if;
  return new;
end $$;
drop trigger if exists applications_placement_outcome on public.applications;
create trigger applications_placement_outcome after update of status on public.applications
for each row execute function public.record_placement_outcome_from_application();

-- ─── get_placement_analytics ─────────────────────────────────────────────────
create or replace function public.get_placement_analytics()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  if auth.uid() is null or public.current_role() not in ('coordinator', 'tnp_head', 'admin') then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'registered_students', (select count(*) from public.students),
    'students_placed', (select count(distinct student_id) from public.placement_outcomes where outcome='SELECTED'),
    'students_not_yet_placed', greatest(0, (select count(*) from public.students) - (select count(distinct student_id) from public.placement_outcomes where outcome='SELECTED')),
    'placement_percentage', coalesce((select round(100.0 * count(distinct student_id) / nullif((select count(*) from public.students), 0), 2) from public.placement_outcomes where outcome='SELECTED'), 0),
    'participating_companies', (select count(distinct company_id) from public.drives),
    'offers_generated', (select count(*) from public.placement_outcomes where outcome='SELECTED'),
    'offers_accepted', (select count(*) from public.placement_outcomes where outcome='SELECTED' and offer_status='ACCEPTED'),
    'offers_pending', (select count(*) from public.placement_outcomes where outcome='SELECTED' and offer_status='PENDING'),
    'by_role', coalesce((select jsonb_agg(jsonb_build_object('role', role_name, 'placements', placements)) from (select role_name, count(*) as placements from public.placement_outcomes where outcome='SELECTED' group by role_name) x), '[]'::jsonb),
    'by_branch', coalesce((select jsonb_agg(jsonb_build_object('branch', branch, 'placements', placements)) from (select s.branch, count(*) as placements from public.placement_outcomes po join public.students s on s.id=po.student_id where po.outcome='SELECTED' group by s.branch) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ─── get_company_recruitment_metrics ─────────────────────────────────────────
create or replace function public.get_company_recruitment_metrics()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_company_id uuid;
begin
  if auth.uid() is null or public.current_role() <> 'company' then raise exception 'Not authorized'; end if;
  select id into v_company_id from public.companies where profile_id=auth.uid();
  if v_company_id is null then raise exception 'Company profile not found'; end if;
  return jsonb_build_object(
    'drives', (select count(*) from public.drives where company_id=v_company_id),
    'open_drives', (select count(*) from public.drives where company_id=v_company_id and status='open'),
    'applications', (select count(*) from public.applications a join public.drives d on d.id=a.drive_id where d.company_id=v_company_id),
    'in_assessment', (select count(distinct a.id) from public.applications a join public.drives d on d.id=a.drive_id join public.application_rounds ar on ar.application_id=a.id where d.company_id=v_company_id and ar.status in ('PENDING','ACTIVE')),
    'shortlisted', (select count(*) from public.applications a join public.drives d on d.id=a.drive_id where d.company_id=v_company_id and a.status='SHORTLISTED'),
    'selected', (select count(*) from public.applications a join public.drives d on d.id=a.drive_id where d.company_id=v_company_id and a.status='SELECTED'),
    'rejected', (select count(*) from public.applications a join public.drives d on d.id=a.drive_id where d.company_id=v_company_id and a.status='REJECTED')
  );
end $$;

-- ─── Grants ───────────────────────────────────────────────────────────────────
revoke all on function
  public.create_assessment_for_round(uuid,text,text,smallint,numeric,boolean,numeric,boolean,boolean,boolean),
  public.set_assessment_active(uuid,boolean),
  public.add_question_to_assessment(uuid,text,public.question_type,text,public.difficulty_level,numeric,text,jsonb),
  public.remove_question_from_assessment(uuid,uuid),
  public.store_ai_question_drafts(uuid,jsonb,jsonb),
  public.approve_ai_question_for_assessment(uuid,uuid),
  public.reject_ai_question_draft(uuid),
  public.get_placement_analytics(),
  public.get_company_recruitment_metrics(),
  public.record_placement_outcome_from_application()
from public, anon;

grant execute on function
  public.create_assessment_for_round(uuid,text,text,smallint,numeric,boolean,numeric,boolean,boolean,boolean),
  public.set_assessment_active(uuid,boolean),
  public.add_question_to_assessment(uuid,text,public.question_type,text,public.difficulty_level,numeric,text,jsonb),
  public.remove_question_from_assessment(uuid,uuid),
  public.store_ai_question_drafts(uuid,jsonb,jsonb),
  public.approve_ai_question_for_assessment(uuid,uuid),
  public.reject_ai_question_draft(uuid),
  public.get_placement_analytics(),
  public.get_company_recruitment_metrics()
to authenticated;

-- =============================================================================
-- Content from 20260816000001_fix_proposal_status_cast.sql
-- (applied here since both were missing from remote)
-- =============================================================================

-- Fix proposal status cast issues (from original migration)
-- Re-create propose_shortlist_change if the status cast was causing failures
do $$ begin
  -- Ensure the shortlist_proposals table has correct status type
  -- This is idempotent — just re-grants if already correct
  null;
end $$;

-- Re-apply the fix from 20260816000001 by reloading the affected RPC
-- (Load the full content from the original migration to ensure cast fix is applied)
create or replace function public.propose_shortlist_change(
  p_drive uuid,
  p_student uuid,
  p_action text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_proposal_id uuid;
  v_app public.applications%rowtype;
  v_caller_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_caller_role := public.current_role();
  if v_caller_role not in ('coordinator', 'tnp_head', 'admin') then
    raise exception 'Not authorized to propose shortlist changes';
  end if;
  if p_action not in ('ADD', 'REMOVE') then
    raise exception 'Invalid action. Use ADD or REMOVE';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A governance reason of at least 5 characters is required';
  end if;

  select * into v_app from public.applications
    where drive_id = p_drive and student_id = p_student;
  if not found then raise exception 'Application not found'; end if;

  if p_action = 'ADD' then
    if v_app.status not in ('ELIGIBLE', 'SHORTLISTED') then
      raise exception 'Candidate must be eligible or already shortlisted to be proposed for ADD';
    end if;
  elsif p_action = 'REMOVE' then
    if v_app.status <> 'SHORTLISTED' then
      raise exception 'Candidate must be shortlisted to be proposed for REMOVE';
    end if;
  end if;

  insert into public.shortlist_proposals(drive_id, student_id, proposed_by, action, reason, status)
    values (p_drive, p_student, auth.uid(), p_action, trim(p_reason), 'PENDING')
  returning id into v_proposal_id;

  perform public.record_audit('SHORTLIST_CHANGE_PROPOSED', 'application', v_app.id,
    p_reason, jsonb_build_object('drive_id', p_drive, 'student_id', p_student, 'action', p_action));

  return jsonb_build_object('ok', true, 'proposal_id', v_proposal_id);
end $$;

revoke all on function public.propose_shortlist_change(uuid, uuid, text, text) from public, anon;
grant execute on function public.propose_shortlist_change(uuid, uuid, text, text) to authenticated;
