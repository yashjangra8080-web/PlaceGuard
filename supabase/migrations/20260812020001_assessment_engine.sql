-- =============================================================================
-- PlaceGuard Assessment Engine Migration
-- 20260812020001_assessment_engine.sql
-- Adds: assessments, questions, test attempts, results, AI drafts,
--       admin change requests, T&P approvals
-- All additive. No existing tables altered or dropped.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1.  New enum types
-- ──────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.question_type   as enum ('MCQ_SINGLE','MCQ_MULTI','TRUE_FALSE','CODING','SQL_QUERY','SHORT_ANSWER');
  create type public.difficulty_level as enum ('EASY','MEDIUM','HARD');
  create type public.attempt_status  as enum ('IN_PROGRESS','SUBMITTED','TIMEOUT','ABANDONED');
  create type public.ai_request_status as enum ('PENDING','GENERATING','COMPLETED','FAILED');
  create type public.change_request_status as enum ('PENDING_TNP_APPROVAL','APPROVED','REJECTED','WITHDRAWN');
exception when duplicate_object then null; end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2.  assessments  (one per drive_round; holds test config)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.assessments (
  id                  uuid primary key default gen_random_uuid(),
  drive_round_id      uuid not null references public.drive_rounds(id) on delete cascade,
  title               text not null check (length(trim(title)) between 2 and 200),
  instructions        text not null default '',
  duration_minutes    smallint not null check (duration_minutes between 1 and 360),
  total_questions     smallint not null default 0,
  max_score           numeric(8,2) not null default 0,
  passing_score       numeric(8,2),
  negative_marking    boolean not null default false,
  negative_fraction   numeric(4,2) not null default 0.25,  -- fraction of mark deducted per wrong
  shuffle_questions   boolean not null default true,
  shuffle_options     boolean not null default true,
  allow_review        boolean not null default true,       -- student can see answers post-submit
  is_active           boolean not null default false,      -- company activates before drive opens
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint assessments_one_per_round unique (drive_round_id)
);
create trigger assessments_updated before update on public.assessments
  for each row execute function public.set_updated_at();
create index if not exists assessments_round_idx on public.assessments(drive_round_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3.  questions  (company-owned question bank)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.questions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  question_text   text not null check (length(trim(question_text)) >= 5),
  question_type   public.question_type not null default 'MCQ_SINGLE',
  topic           text not null default 'General',
  difficulty      public.difficulty_level not null default 'MEDIUM',
  marks           numeric(6,2) not null default 1,
  explanation     text,        -- shown to students only after submission where allowed
  is_active       boolean not null default true,
  ai_generated    boolean not null default false,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger questions_updated before update on public.questions
  for each row execute function public.set_updated_at();
create index if not exists questions_company_idx on public.questions(company_id);
create index if not exists questions_topic_idx on public.questions(company_id, topic);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4.  question_options  (MCQ options — correct flag never sent to students during test)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.question_options (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references public.questions(id) on delete cascade,
  option_text   text not null check (length(trim(option_text)) >= 1),
  is_correct    boolean not null default false,
  display_order smallint not null default 0,
  constraint options_unique_order unique (question_id, display_order)
);
create index if not exists options_question_idx on public.question_options(question_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5.  assessment_questions  (junction: which questions in which assessment + ordering)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.assessment_questions (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null references public.assessments(id) on delete cascade,
  question_id     uuid not null references public.questions(id) on delete restrict,
  display_order   smallint not null default 0,
  constraint aq_unique unique (assessment_id, question_id)
);
create index if not exists aq_assessment_idx on public.assessment_questions(assessment_id, display_order);

-- ──────────────────────────────────────────────────────────────────────────────
-- 6.  coding_problems  (DSA/coding problems with test cases)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.coding_problems (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references public.assessments(id) on delete cascade,
  title               text not null,
  problem_statement   text not null,
  constraints_text    text not null default '',
  input_format        text not null default '',
  output_format       text not null default '',
  sample_input        text not null default '',
  sample_output       text not null default '',
  -- test_cases: [{input, expected_output, is_hidden, description}]
  test_cases          jsonb not null default '[]',
  allowed_languages   text[] not null default array['python','java','cpp'],
  time_limit_ms       integer not null default 2000,
  memory_limit_mb     integer not null default 256,
  max_score           numeric(6,2) not null default 100,
  created_at          timestamptz not null default now(),
  constraint one_problem_per_assessment unique (assessment_id)
);
create index if not exists coding_problems_assessment_idx on public.coding_problems(assessment_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7.  test_attempts  (one per student per assessment; server-side timing)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.test_attempts (
  id                    uuid primary key default gen_random_uuid(),
  assessment_id         uuid not null references public.assessments(id) on delete restrict,
  application_round_id  uuid not null references public.application_rounds(id) on delete restrict,
  student_profile_id    uuid not null references public.profiles(id),
  status                public.attempt_status not null default 'IN_PROGRESS',
  started_at            timestamptz not null default now(),
  submitted_at          timestamptz,
  time_taken_seconds    integer,
  -- Snapshot of questions served (ordered list of question ids, for audit)
  question_order        uuid[] not null default '{}',
  constraint ta_unique unique (assessment_id, student_profile_id)
);
create index if not exists attempts_assessment_idx on public.test_attempts(assessment_id);
create index if not exists attempts_student_idx on public.test_attempts(student_profile_id);
create index if not exists attempts_app_round_idx on public.test_attempts(application_round_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 8.  submitted_answers  (immutable after test submission)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.submitted_answers (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references public.test_attempts(id) on delete cascade,
  question_id     uuid not null references public.questions(id),
  -- For MCQ_SINGLE: one option id; MCQ_MULTI: comma-separated option ids; others: null
  selected_option_ids uuid[],
  -- For short answer / SQL / coding: text response
  text_response   text,
  is_correct      boolean,      -- computed at submission time
  marks_awarded   numeric(6,2), -- computed at submission time
  answered_at     timestamptz not null default now(),
  constraint sa_unique unique (attempt_id, question_id)
);
create index if not exists answers_attempt_idx on public.submitted_answers(attempt_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 9.  coding_submissions  (code submitted for coding rounds)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.coding_submissions (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.test_attempts(id) on delete cascade,
  problem_id          uuid not null references public.coding_problems(id),
  language            text not null,
  source_code         text not null,
  submitted_at        timestamptz not null default now(),
  -- judge0 / execution results
  execution_status    text not null default 'PENDING_EXTERNAL_CONFIG',
  testcases_total     integer,
  testcases_passed    integer,
  testcases_failed    integer,
  execution_time_ms   integer,
  memory_used_kb      integer,
  score               numeric(6,2),
  judge_response      jsonb,    -- raw response from Judge0 for audit
  constraint cs_unique unique (attempt_id)
);
create index if not exists coding_submissions_attempt_idx on public.coding_submissions(attempt_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 10. assessment_results  (computed after submission — written only by RPC)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.assessment_results (
  id                    uuid primary key default gen_random_uuid(),
  attempt_id            uuid not null references public.test_attempts(id) on delete cascade,
  assessment_id         uuid not null references public.assessments(id),
  student_profile_id    uuid not null references public.profiles(id),
  application_round_id  uuid not null references public.application_rounds(id),
  total_score           numeric(8,2) not null default 0,
  max_score             numeric(8,2) not null default 0,
  percentage            numeric(5,2) not null default 0,
  correct_count         integer not null default 0,
  incorrect_count       integer not null default 0,
  unanswered_count      integer not null default 0,
  accuracy              numeric(5,2) not null default 0,
  time_taken_seconds    integer not null default 0,
  passed                boolean not null default false,
  -- section_results: [{topic, difficulty, correct, total, score, max_score}]
  section_results       jsonb not null default '[]',
  computed_at           timestamptz not null default now(),
  constraint asmnt_results_attempt_unique unique (attempt_id)
);
create index if not exists results_student_idx on public.assessment_results(student_profile_id);
create index if not exists results_assessment_idx on public.assessment_results(assessment_id);
create index if not exists results_app_round_idx on public.assessment_results(application_round_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 11. ai_generation_requests  (tracks Gemini request jobs)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_generation_requests (
  id              uuid primary key default gen_random_uuid(),
  requested_by    uuid not null references public.profiles(id),
  request_type    text not null,   -- 'QUESTIONS' | 'RECRUITMENT_PLAN' | 'CANDIDATE_ANALYSIS' | 'COMPANY_SUMMARY' | 'GOVERNANCE_SUMMARY'
  context         jsonb not null default '{}',  -- role, topic, difficulty, count etc.
  status          public.ai_request_status not null default 'PENDING',
  result_count    integer,
  error_message   text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists ai_req_user_idx on public.ai_generation_requests(requested_by);
create index if not exists ai_req_status_idx on public.ai_generation_requests(status);

-- ──────────────────────────────────────────────────────────────────────────────
-- 12. ai_generated_questions  (draft questions from Gemini — need human approval)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_generated_questions (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.ai_generation_requests(id) on delete cascade,
  company_id      uuid not null references public.companies(id),
  question_text   text not null,
  question_type   public.question_type not null default 'MCQ_SINGLE',
  topic           text not null default 'General',
  difficulty      public.difficulty_level not null default 'MEDIUM',
  marks           numeric(6,2) not null default 1,
  explanation     text,
  options         jsonb not null default '[]',  -- [{text, is_correct}]
  review_status   text not null default 'DRAFT' check (review_status in ('DRAFT','APPROVED','REJECTED')),
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  approved_question_id uuid references public.questions(id), -- populated when approved
  created_at      timestamptz not null default now()
);
create index if not exists ai_qs_request_idx on public.ai_generated_questions(request_id);
create index if not exists ai_qs_company_idx on public.ai_generated_questions(company_id, review_status);

-- ──────────────────────────────────────────────────────────────────────────────
-- 13. admin_change_requests  (admin-requested sensitive changes; need T&P approval)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.admin_change_requests (
  id              uuid primary key default gen_random_uuid(),
  requested_by    uuid not null references public.profiles(id),
  entity_type     text not null,   -- 'drive' | 'eligibility_rule' | 'drive_round' | 'application' | 'shortlist' | 'assessment'
  entity_id       uuid not null,
  action          text not null,   -- 'UPDATE_ELIGIBILITY' | 'CHANGE_ROUND_CONFIG' | 'OVERRIDE_RESULT' | ...
  old_value       jsonb,
  new_value       jsonb not null,
  reason          text not null check (length(trim(reason)) >= 10),
  status          public.change_request_status not null default 'PENDING_TNP_APPROVAL',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger admin_cr_updated before update on public.admin_change_requests
  for each row execute function public.set_updated_at();
create index if not exists acr_requester_idx on public.admin_change_requests(requested_by);
create index if not exists acr_status_idx on public.admin_change_requests(status);

-- ──────────────────────────────────────────────────────────────────────────────
-- 14. change_request_approvals  (T&P decision on each admin change request)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.change_request_approvals (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.admin_change_requests(id) on delete cascade,
  reviewed_by     uuid not null references public.profiles(id),
  decision        public.approval_decision not null,
  reason          text not null default '',
  applied_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint cra_unique unique (request_id)
);
create index if not exists cra_request_idx on public.change_request_approvals(request_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 15. RLS — enable on all new tables
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.assessments              enable row level security;
alter table public.questions                enable row level security;
alter table public.question_options         enable row level security;
alter table public.assessment_questions     enable row level security;
alter table public.coding_problems          enable row level security;
alter table public.test_attempts            enable row level security;
alter table public.submitted_answers        enable row level security;
alter table public.coding_submissions       enable row level security;
alter table public.assessment_results       enable row level security;
alter table public.ai_generation_requests   enable row level security;
alter table public.ai_generated_questions   enable row level security;
alter table public.admin_change_requests    enable row level security;
alter table public.change_request_approvals enable row level security;

-- ──────────────────────────────────────────────────────────────────────────────
-- 16. RLS Policies
-- ──────────────────────────────────────────────────────────────────────────────

-- assessments: readable by company owner or staff; students see active assessments for open drives
create policy assessments_visible on public.assessments for select using (
  public.is_company_owner((select drive_id from public.drive_rounds dr where dr.id = drive_round_id))
  or public.is_staff()
  or (
    is_active = true
    and exists (
      select 1 from public.drive_rounds dr
      join public.drives d on d.id = dr.drive_id
      where dr.id = drive_round_id and d.status = 'open'
    )
  )
);
-- assessments: company can insert/update on their own drives (draft only for major changes)
create policy assessments_company_write on public.assessments for all using (
  public.is_company_owner((select drive_id from public.drive_rounds dr where dr.id = drive_round_id))
) with check (
  public.is_company_owner((select drive_id from public.drive_rounds dr where dr.id = drive_round_id))
);

-- questions: company sees own + staff sees all
create policy questions_company_own on public.questions for select using (
  company_id in (select id from public.companies where profile_id = auth.uid())
  or public.is_staff()
);
create policy questions_company_write on public.questions for all using (
  company_id in (select id from public.companies where profile_id = auth.uid())
) with check (
  company_id in (select id from public.companies where profile_id = auth.uid())
);

-- question_options: readable when question is readable
create policy options_readable on public.question_options for select using (
  exists (
    select 1 from public.questions q
    where q.id = question_id
      and (
        q.company_id in (select id from public.companies where profile_id = auth.uid())
        or public.is_staff()
      )
  )
);
create policy options_company_write on public.question_options for all using (
  exists (
    select 1 from public.questions q
    where q.id = question_id
      and q.company_id in (select id from public.companies where profile_id = auth.uid())
  )
) with check (
  exists (
    select 1 from public.questions q
    where q.id = question_id
      and q.company_id in (select id from public.companies where profile_id = auth.uid())
  )
);

-- assessment_questions: readable if assessment is readable
create policy aq_readable on public.assessment_questions for select using (
  exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id
      and (public.is_company_owner(dr.drive_id) or public.is_staff())
  )
);
create policy aq_company_write on public.assessment_questions for all using (
  exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id
      and public.is_company_owner(dr.drive_id)
  )
) with check (
  exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id
      and public.is_company_owner(dr.drive_id)
  )
);

-- coding_problems: company owner or staff
create policy coding_problems_visible on public.coding_problems for select using (
  exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id
      and (public.is_company_owner(dr.drive_id) or public.is_staff())
  )
  or (
    exists (
      select 1 from public.assessments a
      join public.drive_rounds dr on dr.id = a.drive_round_id
      join public.drives d on d.id = dr.drive_id
      where a.id = assessment_id and d.status = 'open'
        and exists (
          select 1 from public.test_attempts ta
          where ta.assessment_id = assessment_id
            and ta.student_profile_id = auth.uid()
            and ta.status = 'IN_PROGRESS'
        )
    )
  )
);
create policy coding_problems_company_write on public.coding_problems for all using (
  exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id and public.is_company_owner(dr.drive_id)
  )
) with check (
  exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id and public.is_company_owner(dr.drive_id)
  )
);

-- test_attempts: students see own; company/staff see attempts for their drives
create policy attempts_readable on public.test_attempts for select using (
  student_profile_id = auth.uid()
  or exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id
      and (public.is_company_owner(dr.drive_id) or public.is_staff())
  )
);
-- No direct INSERT/UPDATE/DELETE for attempts — all through RPCs

-- submitted_answers: students see own (no update ever from client)
create policy answers_readable on public.submitted_answers for select using (
  exists (
    select 1 from public.test_attempts ta
    where ta.id = attempt_id
      and (
        ta.student_profile_id = auth.uid()
        or exists (
          select 1 from public.assessments a
          join public.drive_rounds dr on dr.id = a.drive_round_id
          where a.id = ta.assessment_id
            and (public.is_company_owner(dr.drive_id) or public.is_staff())
        )
      )
  )
);

-- coding_submissions: same as submitted_answers
create policy coding_sub_readable on public.coding_submissions for select using (
  exists (
    select 1 from public.test_attempts ta
    where ta.id = attempt_id
      and (
        ta.student_profile_id = auth.uid()
        or exists (
          select 1 from public.assessments a
          join public.drive_rounds dr on dr.id = a.drive_round_id
          where a.id = ta.assessment_id
            and (public.is_company_owner(dr.drive_id) or public.is_staff())
        )
      )
  )
);

-- assessment_results: student sees own; company/staff see for their drives
create policy results_readable on public.assessment_results for select using (
  student_profile_id = auth.uid()
  or exists (
    select 1 from public.assessments a
    join public.drive_rounds dr on dr.id = a.drive_round_id
    where a.id = assessment_id
      and (public.is_company_owner(dr.drive_id) or public.is_staff())
  )
);

-- ai_generation_requests: requester or company staff
create policy ai_req_readable on public.ai_generation_requests for select using (
  requested_by = auth.uid() or public.is_staff()
);

-- ai_generated_questions: company that owns them + staff
create policy ai_qs_readable on public.ai_generated_questions for select using (
  company_id in (select id from public.companies where profile_id = auth.uid())
  or public.is_staff()
);

-- admin_change_requests: requester or tnp_head
create policy acr_readable on public.admin_change_requests for select using (
  requested_by = auth.uid() or public.current_role() = 'tnp_head'
);

-- change_request_approvals: tnp_head + the requester
create policy cra_readable on public.change_request_approvals for select using (
  reviewed_by = auth.uid()
  or exists (
    select 1 from public.admin_change_requests r
    where r.id = request_id and r.requested_by = auth.uid()
  )
  or public.current_role() = 'tnp_head'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 17. RPC: start_test_attempt
--   Called by student to begin a test.
--   Returns: attempt metadata + questions (WITHOUT is_correct flag)
--   Security: validates PENDING round ownership, one-attempt-per-student
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.start_test_attempt(p_assessment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_student      public.students%rowtype;
  v_assessment   public.assessments%rowtype;
  v_attempt_id   uuid;
  v_app_round_id uuid;
  v_question_ids uuid[];
  v_questions    jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if public.current_role() <> 'student' then raise exception 'Only students can start tests'; end if;

  -- Get student record
  select * into v_student from public.students where profile_id = auth.uid();
  if not found then raise exception 'Student record not found'; end if;

  -- Get assessment
  select * into v_assessment from public.assessments where id = p_assessment;
  if not found then raise exception 'Assessment not found'; end if;
  if not v_assessment.is_active then raise exception 'Assessment is not active'; end if;

  -- Find PENDING application_round for this student in this drive_round
  select ar.id into v_app_round_id
  from public.application_rounds ar
  join public.applications a on a.id = ar.application_id
  join public.students s on s.id = a.student_id
  where ar.round_id = v_assessment.drive_round_id
    and s.profile_id = auth.uid()
    and ar.status = 'PENDING'
  limit 1;

  if v_app_round_id is null then
    raise exception 'No active (PENDING) round found for your application. Check your eligibility and round progress.';
  end if;

  -- Check for existing attempt
  if exists (
    select 1 from public.test_attempts
    where assessment_id = p_assessment and student_profile_id = auth.uid()
  ) then
    -- Return existing attempt if still IN_PROGRESS
    select id into v_attempt_id from public.test_attempts
    where assessment_id = p_assessment and student_profile_id = auth.uid()
      and status = 'IN_PROGRESS';
    if v_attempt_id is null then
      raise exception 'You have already submitted this assessment.';
    end if;
    -- Return existing attempt info
    select array_agg(aq.question_id order by aq.display_order)
    into v_question_ids
    from public.assessment_questions aq
    where aq.assessment_id = p_assessment;

    select json_agg(
      jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'topic', q.topic,
        'difficulty', q.difficulty,
        'marks', q.marks,
        'options', (
          select json_agg(
            jsonb_build_object('id', o.id, 'option_text', o.option_text, 'display_order', o.display_order)
            order by o.display_order
          )
          from public.question_options o where o.question_id = q.id
        )
      )
      order by aq.display_order
    ) into v_questions
    from public.assessment_questions aq
    join public.questions q on q.id = aq.question_id
    where aq.assessment_id = p_assessment;

    return jsonb_build_object(
      'attempt_id', v_attempt_id,
      'assessment_id', p_assessment,
      'title', v_assessment.title,
      'instructions', v_assessment.instructions,
      'duration_minutes', v_assessment.duration_minutes,
      'shuffle_questions', v_assessment.shuffle_questions,
      'shuffle_options', v_assessment.shuffle_options,
      'allow_review', v_assessment.allow_review,
      'negative_marking', v_assessment.negative_marking,
      'negative_fraction', v_assessment.negative_fraction,
      'questions', coalesce(v_questions, '[]'::json),
      'resumed', true
    );
  end if;

  -- Build ordered question list (optionally shuffled)
  if v_assessment.shuffle_questions then
    select array_agg(aq.question_id order by random())
    into v_question_ids
    from public.assessment_questions aq
    where aq.assessment_id = p_assessment;
  else
    select array_agg(aq.question_id order by aq.display_order)
    into v_question_ids
    from public.assessment_questions aq
    where aq.assessment_id = p_assessment;
  end if;

  -- Create attempt
  insert into public.test_attempts (
    assessment_id, application_round_id, student_profile_id, status, started_at, question_order
  ) values (
    p_assessment, v_app_round_id, auth.uid(), 'IN_PROGRESS', now(),
    coalesce(v_question_ids, '{}')
  ) returning id into v_attempt_id;

  -- Return questions WITHOUT is_correct flag
  select json_agg(
    jsonb_build_object(
      'id', q.id,
      'question_text', q.question_text,
      'question_type', q.question_type,
      'topic', q.topic,
      'difficulty', q.difficulty,
      'marks', q.marks,
      'options', (
        select json_agg(
          jsonb_build_object('id', o.id, 'option_text', o.option_text, 'display_order', o.display_order)
          order by case when v_assessment.shuffle_options then random() else o.display_order::float end
        )
        from public.question_options o where o.question_id = q.id
      )
    )
    order by array_position(v_question_ids, q.id)
  ) into v_questions
  from public.questions q
  where q.id = any(v_question_ids);

  perform public.record_audit('TEST_STARTED', 'assessment', p_assessment, null,
    jsonb_build_object('student', auth.uid(), 'attempt', v_attempt_id));

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'assessment_id', p_assessment,
    'title', v_assessment.title,
    'instructions', v_assessment.instructions,
    'duration_minutes', v_assessment.duration_minutes,
    'shuffle_questions', v_assessment.shuffle_questions,
    'shuffle_options', v_assessment.shuffle_options,
    'allow_review', v_assessment.allow_review,
    'negative_marking', v_assessment.negative_marking,
    'negative_fraction', v_assessment.negative_fraction,
    'questions', coalesce(v_questions, '[]'::json),
    'resumed', false
  );
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 18. RPC: submit_mcq_attempt
--   Validates timing, scores answers, writes results, updates round progression.
--   p_answers: [{question_id, selected_option_ids}]
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_mcq_attempt(
  p_attempt   uuid,
  p_answers   jsonb   -- [{question_id: uuid, selected_option_ids: [uuid,...]}]
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_attempt       public.test_attempts%rowtype;
  v_assessment    public.assessments%rowtype;
  v_deadline      timestamptz;
  v_total_score   numeric := 0;
  v_max_score     numeric := 0;
  v_correct       integer := 0;
  v_incorrect     integer := 0;
  v_unanswered    integer := 0;
  v_time_taken    integer;
  v_passed        boolean;
  v_result_id     uuid;
  v_section_data  jsonb;
  v_ans           jsonb;
  v_q             public.questions%rowtype;
  v_correct_ids   uuid[];
  v_selected_ids  uuid[];
  v_is_correct    boolean;
  v_marks         numeric;
  v_total_q       integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Validate attempt ownership
  select * into v_attempt from public.test_attempts where id = p_attempt for update;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.student_profile_id <> auth.uid() then raise exception 'Not your attempt'; end if;
  if v_attempt.status <> 'IN_PROGRESS' then raise exception 'Attempt already submitted or closed'; end if;

  -- Get assessment
  select * into v_assessment from public.assessments where id = v_attempt.assessment_id;

  -- Server-side timer validation
  v_deadline := v_attempt.started_at + (v_assessment.duration_minutes * interval '1 minute') + interval '30 seconds';
  if now() > v_deadline then
    -- Auto-close as TIMEOUT
    update public.test_attempts set status = 'TIMEOUT', submitted_at = now() where id = p_attempt;
    raise exception 'Test time has expired. Your attempt has been recorded as TIMEOUT.';
  end if;

  v_time_taken := extract(epoch from (now() - v_attempt.started_at))::integer;

  -- Count total questions for this assessment
  select count(*) into v_total_q from public.assessment_questions where assessment_id = v_attempt.assessment_id;

  -- Score each question
  for v_ans in select * from jsonb_array_elements(p_answers) loop
    select * into v_q from public.questions where id = (v_ans->>'question_id')::uuid;
    if not found then continue; end if;

    -- Get correct option ids
    select array_agg(id) into v_correct_ids
    from public.question_options
    where question_id = v_q.id and is_correct = true;

    -- Get student selected ids
    select array_agg(x::uuid) into v_selected_ids
    from jsonb_array_elements_text(coalesce(v_ans->'selected_option_ids', '[]'::jsonb)) x;

    v_is_correct := false;
    v_marks := 0;

    if v_selected_ids is null or array_length(v_selected_ids, 1) = 0 then
      -- Unanswered
      v_unanswered := v_unanswered + 1;
    else
      -- Check correctness
      if v_q.question_type = 'MCQ_SINGLE' then
        v_is_correct := (v_selected_ids[1] = any(v_correct_ids)) and array_length(v_correct_ids,1) = 1;
      elsif v_q.question_type = 'MCQ_MULTI' then
        -- All correct options selected and no wrong ones
        v_is_correct := (v_selected_ids @> v_correct_ids) and (v_correct_ids @> v_selected_ids);
      end if;

      if v_is_correct then
        v_correct := v_correct + 1;
        v_marks := v_q.marks;
      else
        v_incorrect := v_incorrect + 1;
        if v_assessment.negative_marking then
          v_marks := -(v_q.marks * v_assessment.negative_fraction);
        end if;
      end if;
    end if;

    v_total_score := v_total_score + v_marks;
    v_max_score := v_max_score + v_q.marks;

    -- Record submitted answer (immutable from this point)
    insert into public.submitted_answers (
      attempt_id, question_id, selected_option_ids, is_correct, marks_awarded
    ) values (
      p_attempt, v_q.id, v_selected_ids, v_is_correct, v_marks
    ) on conflict (attempt_id, question_id) do nothing;
  end loop;

  -- Account for questions not included in p_answers
  v_unanswered := v_unanswered + (v_total_q - v_correct - v_incorrect - v_unanswered);
  v_total_score := greatest(0, v_total_score);

  -- Update max_score from assessment if available
  if v_assessment.max_score > 0 then
    v_max_score := v_assessment.max_score;
  end if;

  -- Build section_results from topic/difficulty breakdown
  select jsonb_agg(
    jsonb_build_object(
      'topic', q.topic,
      'difficulty', q.difficulty,
      'correct', coalesce(sum(case when sa.is_correct then 1 else 0 end), 0),
      'total', count(q.id),
      'score', coalesce(sum(case when sa.is_correct then q.marks else 0 end), 0),
      'max_score', sum(q.marks)
    )
  ) into v_section_data
  from public.assessment_questions aq
  join public.questions q on q.id = aq.question_id
  left join public.submitted_answers sa on sa.question_id = q.id and sa.attempt_id = p_attempt
  where aq.assessment_id = v_attempt.assessment_id
  group by q.topic, q.difficulty;

  v_passed := v_assessment.passing_score is null or v_total_score >= v_assessment.passing_score;

  -- Mark attempt submitted
  update public.test_attempts
  set status = 'SUBMITTED', submitted_at = now(), time_taken_seconds = v_time_taken
  where id = p_attempt;

  -- Write result
  insert into public.assessment_results (
    attempt_id, assessment_id, student_profile_id, application_round_id,
    total_score, max_score, percentage, correct_count, incorrect_count, unanswered_count,
    accuracy, time_taken_seconds, passed, section_results
  ) values (
    p_attempt, v_attempt.assessment_id, auth.uid(), v_attempt.application_round_id,
    v_total_score,
    v_max_score,
    case when v_max_score > 0 then round((v_total_score / v_max_score) * 100, 2) else 0 end,
    v_correct, v_incorrect, v_unanswered,
    case when (v_correct + v_incorrect) > 0 then round((v_correct::numeric / (v_correct + v_incorrect)) * 100, 2) else 0 end,
    v_time_taken, v_passed,
    coalesce(v_section_data, '[]'::jsonb)
  ) returning id into v_result_id;

  -- Update application_round via evaluate_round logic
  perform public.evaluate_round(
    p_application_round_id := v_attempt.application_round_id,
    p_status               := case when v_passed then 'PASSED'::public.candidate_round_status else 'FAILED'::public.candidate_round_status end,
    p_score                := v_total_score,
    p_feedback             := 'Auto-evaluated: ' || case when v_passed then 'PASSED' else 'FAILED' end
  );

  perform public.record_audit('TEST_SUBMITTED', 'assessment', v_attempt.assessment_id, null,
    jsonb_build_object('attempt', p_attempt, 'score', v_total_score, 'passed', v_passed, 'student', auth.uid()));

  return jsonb_build_object(
    'result_id', v_result_id,
    'attempt_id', p_attempt,
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', case when v_max_score > 0 then round((v_total_score / v_max_score) * 100, 2) else 0 end,
    'correct_count', v_correct,
    'incorrect_count', v_incorrect,
    'unanswered_count', v_unanswered,
    'accuracy', case when (v_correct + v_incorrect) > 0 then round((v_correct::numeric / (v_correct + v_incorrect)) * 100, 2) else 0 end,
    'time_taken_seconds', v_time_taken,
    'passed', v_passed
  );
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 19. RPC: get_attempt_result
--   Returns full result including correct answers (post-submission only).
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.get_attempt_result(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_attempt      public.test_attempts%rowtype;
  v_assessment   public.assessments%rowtype;
  v_result       public.assessment_results%rowtype;
  v_questions    jsonb;
  v_app_round    public.application_rounds%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_attempt from public.test_attempts where id = p_attempt;
  if not found then raise exception 'Attempt not found'; end if;

  -- Authorization: student owns it OR company owns the drive OR staff
  if v_attempt.student_profile_id <> auth.uid() then
    select * into v_assessment from public.assessments where id = v_attempt.assessment_id;
    if not (public.is_company_owner((select drive_id from public.drive_rounds where id = v_assessment.drive_round_id)) or public.is_staff()) then
      raise exception 'Not authorized to view this result';
    end if;
  end if;

  if v_attempt.status = 'IN_PROGRESS' then
    raise exception 'Test is still in progress. Submit first.';
  end if;

  select * into v_assessment from public.assessments where id = v_attempt.assessment_id;
  select * into v_result from public.assessment_results where attempt_id = p_attempt;
  select * into v_app_round from public.application_rounds where id = v_attempt.application_round_id;

  -- Build per-question review WITH correct answers (post-submission)
  if v_assessment.allow_review then
    select json_agg(
      jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'topic', q.topic,
        'difficulty', q.difficulty,
        'marks', q.marks,
        'explanation', q.explanation,
        'options', (
          select json_agg(
            jsonb_build_object(
              'id', o.id,
              'option_text', o.option_text,
              'is_correct', o.is_correct,
              'display_order', o.display_order
            ) order by o.display_order
          ) from public.question_options o where o.question_id = q.id
        ),
        'student_answer', (
          select jsonb_build_object(
            'selected_option_ids', sa.selected_option_ids,
            'is_correct', sa.is_correct,
            'marks_awarded', sa.marks_awarded
          ) from public.submitted_answers sa
          where sa.attempt_id = p_attempt and sa.question_id = q.id
        )
      )
      order by array_position(v_attempt.question_order, q.id)
    ) into v_questions
    from public.questions q
    where q.id = any(v_attempt.question_order);
  end if;

  return jsonb_build_object(
    'attempt_id', p_attempt,
    'assessment_title', v_assessment.title,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'submitted_at', v_attempt.submitted_at,
    'time_taken_seconds', v_result.time_taken_seconds,
    'total_score', v_result.total_score,
    'max_score', v_result.max_score,
    'percentage', v_result.percentage,
    'correct_count', v_result.correct_count,
    'incorrect_count', v_result.incorrect_count,
    'unanswered_count', v_result.unanswered_count,
    'accuracy', v_result.accuracy,
    'passed', v_result.passed,
    'passing_score', v_assessment.passing_score,
    'section_results', v_result.section_results,
    'round_status', v_app_round.status,
    'allow_review', v_assessment.allow_review,
    'question_review', coalesce(v_questions, '[]'::json)
  );
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 20. RPC: get_assessment_for_round
--   Returns assessment metadata (and problem for coding) for a drive_round.
--   Called by student/company to check if a round has an active assessment.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.get_assessment_for_round(p_round uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_assessment public.assessments%rowtype;
  v_problem    public.coding_problems%rowtype;
  v_existing_attempt public.test_attempts%rowtype;
  v_result     public.assessment_results%rowtype;
begin
  select * into v_assessment from public.assessments
  where drive_round_id = p_round;

  if not found then return null; end if;

  -- Check student's existing attempt
  if public.current_role() = 'student' then
    select * into v_existing_attempt
    from public.test_attempts
    where assessment_id = v_assessment.id and student_profile_id = auth.uid();

    if v_existing_attempt.id is not null then
      select * into v_result from public.assessment_results where attempt_id = v_existing_attempt.id;
    end if;
  end if;

  -- Get coding problem if applicable
  select * into v_problem from public.coding_problems where assessment_id = v_assessment.id;

  return jsonb_build_object(
    'assessment_id', v_assessment.id,
    'title', v_assessment.title,
    'instructions', v_assessment.instructions,
    'duration_minutes', v_assessment.duration_minutes,
    'total_questions', v_assessment.total_questions,
    'max_score', v_assessment.max_score,
    'passing_score', v_assessment.passing_score,
    'negative_marking', v_assessment.negative_marking,
    'is_active', v_assessment.is_active,
    'has_coding_problem', (v_problem.id is not null),
    'existing_attempt_id', v_existing_attempt.id,
    'existing_attempt_status', v_existing_attempt.status,
    'result_id', v_result.id,
    'passed', v_result.passed
  );
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 21. RPC: request_admin_change
--   Admin-only. Creates a pending change request for T&P review.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.request_admin_change(
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_old_value   jsonb,
  p_new_value   jsonb,
  p_reason      text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_request_id uuid;
begin
  if auth.uid() is null or public.current_role() <> 'admin' then
    raise exception 'Only admin users can request changes';
  end if;
  if length(trim(p_reason)) < 10 then
    raise exception 'Please provide a detailed reason (at least 10 characters)';
  end if;

  insert into public.admin_change_requests (
    requested_by, entity_type, entity_id, action, old_value, new_value, reason
  ) values (
    auth.uid(), p_entity_type, p_entity_id, p_action, p_old_value, p_new_value, p_reason
  ) returning id into v_request_id;

  perform public.record_audit('ADMIN_CHANGE_REQUESTED', p_entity_type::text, p_entity_id,
    p_reason, jsonb_build_object('action', p_action, 'request_id', v_request_id));

  return v_request_id;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 22. RPC: approve_admin_change
--   T&P Head only. Approves or rejects an admin change request.
--   If approved, applies the change (currently records the decision; specific
--   entity mutations are dispatched per entity_type).
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.approve_admin_change(
  p_request_id uuid,
  p_decision   public.approval_decision,
  p_reason     text
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_req public.admin_change_requests%rowtype;
begin
  if auth.uid() is null or public.current_role() <> 'tnp_head' then
    raise exception 'Only T&P Head can review change requests';
  end if;

  select * into v_req from public.admin_change_requests where id = p_request_id for update;
  if not found then raise exception 'Change request not found'; end if;
  if v_req.status <> 'PENDING_TNP_APPROVAL' then
    raise exception 'Change request is no longer pending (status: %)', v_req.status;
  end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'Separation of duties: T&P cannot approve their own change requests';
  end if;

  -- Record the approval decision
  insert into public.change_request_approvals (request_id, reviewed_by, decision, reason, applied_at)
  values (p_request_id, auth.uid(), p_decision, p_reason, case when p_decision = 'APPROVED' then now() else null end);

  -- Update request status
  update public.admin_change_requests
  set status = case when p_decision = 'APPROVED' then 'APPROVED'::public.change_request_status
                    else 'REJECTED'::public.change_request_status end
  where id = p_request_id;

  -- Audit
  perform public.record_audit(
    case when p_decision = 'APPROVED' then 'ADMIN_CHANGE_APPROVED' else 'ADMIN_CHANGE_REJECTED' end,
    v_req.entity_type, v_req.entity_id, p_reason,
    jsonb_build_object('request_id', p_request_id, 'action', v_req.action, 'new_value', v_req.new_value)
  );
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 23. RPC: get_drive_assessment_analytics  (company/staff)
--   Returns aggregate stats for a drive's assessments.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.get_drive_assessment_analytics(p_drive uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (public.is_company_owner(p_drive) or public.is_staff()) then
    raise exception 'Not authorized';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'round_name', dr.name,
      'round_number', dr.round_number,
      'round_type', dr.round_type,
      'assessment_id', a.id,
      'assessment_title', a.title,
      'total_attempts', (select count(*) from public.test_attempts ta where ta.assessment_id = a.id and ta.status = 'SUBMITTED'),
      'avg_score', (select avg(ar.total_score) from public.assessment_results ar join public.test_attempts ta on ta.id = ar.attempt_id where ta.assessment_id = a.id),
      'pass_rate', (select round(100.0 * count(*) filter (where ar.passed) / nullif(count(*), 0), 1) from public.assessment_results ar join public.test_attempts ta on ta.id = ar.attempt_id where ta.assessment_id = a.id),
      'max_score', a.max_score,
      'passing_score', a.passing_score
    ) order by dr.round_number
  ) into v_result
  from public.drive_rounds dr
  join public.assessments a on a.drive_round_id = dr.id
  where dr.drive_id = p_drive;

  return coalesce(v_result, '[]'::jsonb);
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 24. RPC: approve_ai_question  (company approves a draft AI question)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.approve_ai_question(
  p_draft_id    uuid,
  p_edits       jsonb default null   -- optional edits to apply before inserting
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_draft        public.ai_generated_questions%rowtype;
  v_company_id   uuid;
  v_question_id  uuid;
  v_opt          jsonb;
  v_order        smallint := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_draft from public.ai_generated_questions where id = p_draft_id;
  if not found then raise exception 'Draft question not found'; end if;

  -- Verify company ownership
  select id into v_company_id from public.companies where profile_id = auth.uid();
  if v_draft.company_id <> v_company_id then raise exception 'Not authorized'; end if;
  if v_draft.review_status <> 'DRAFT' then raise exception 'Draft has already been reviewed'; end if;

  -- Insert into question bank
  insert into public.questions (
    company_id, question_text, question_type, topic, difficulty, marks, explanation,
    ai_generated, created_by
  ) values (
    v_draft.company_id,
    coalesce(p_edits->>'question_text', v_draft.question_text),
    coalesce((p_edits->>'question_type')::public.question_type, v_draft.question_type),
    coalesce(p_edits->>'topic', v_draft.topic),
    coalesce((p_edits->>'difficulty')::public.difficulty_level, v_draft.difficulty),
    coalesce((p_edits->>'marks')::numeric, v_draft.marks),
    coalesce(p_edits->>'explanation', v_draft.explanation),
    true, auth.uid()
  ) returning id into v_question_id;

  -- Insert options
  for v_opt in select * from jsonb_array_elements(
    coalesce(p_edits->'options', v_draft.options)
  ) loop
    insert into public.question_options (question_id, option_text, is_correct, display_order)
    values (v_question_id, v_opt->>'text', (v_opt->>'is_correct')::boolean, v_order);
    v_order := v_order + 1;
  end loop;

  -- Mark draft as approved
  update public.ai_generated_questions
  set review_status = 'APPROVED', reviewed_by = auth.uid(),
      reviewed_at = now(), approved_question_id = v_question_id
  where id = p_draft_id;

  return v_question_id;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 25. Helper: update_assessment_totals  (trigger to keep total_questions in sync)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_assessment_totals()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_aid uuid;
begin
  v_aid := coalesce(new.assessment_id, old.assessment_id);
  update public.assessments
  set total_questions = (
        select count(*) from public.assessment_questions where assessment_id = v_aid
      ),
      max_score = (
        select coalesce(sum(q.marks), 0)
        from public.assessment_questions aq
        join public.questions q on q.id = aq.question_id
        where aq.assessment_id = v_aid
      )
  where id = v_aid;
  return coalesce(new, old);
end $$;

create trigger sync_totals_on_question_add
  after insert or delete on public.assessment_questions
  for each row execute function public.sync_assessment_totals();

-- ──────────────────────────────────────────────────────────────────────────────
-- 26. Grants
-- ──────────────────────────────────────────────────────────────────────────────
grant execute on function
  public.start_test_attempt(uuid),
  public.submit_mcq_attempt(uuid, jsonb),
  public.get_attempt_result(uuid),
  public.get_assessment_for_round(uuid),
  public.request_admin_change(text, uuid, text, jsonb, jsonb, text),
  public.approve_admin_change(uuid, public.approval_decision, text),
  public.get_drive_assessment_analytics(uuid),
  public.approve_ai_question(uuid, jsonb)
to authenticated;
