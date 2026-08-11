-- PlaceGuard: Recruitment Rounds System
-- ============================================================
-- Adds drive_rounds (the template of rounds per drive) and
-- application_rounds (the per-student progress through each round).
-- Also adds a publish_drive RPC that was referenced in grants but
-- never defined, plus secure RPCs for round management.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. ENUMS
-- ──────────────────────────────────────────────────────────
create type public.round_type as enum (
  'APTITUDE',
  'CODING',
  'SQL_ASSESSMENT',
  'LINUX_ASSESSMENT',
  'CLOUD_ASSESSMENT',
  'TECHNICAL_INTERVIEW',
  'HR_INTERVIEW',
  'GROUP_DISCUSSION',
  'ASSESSMENT',
  'OTHER'
);

create type public.round_status as enum (
  'PENDING',    -- not yet started
  'ACTIVE',     -- currently in progress
  'COMPLETED',  -- evaluation done
  'CANCELLED'
);

create type public.candidate_round_status as enum (
  'LOCKED',         -- student cannot reach this round yet
  'PENDING',        -- round is active but result not recorded
  'PASSED',         -- passed / advanced
  'FAILED',         -- failed elimination round → rejected
  'ABSENT',         -- did not appear
  'NOT_ATTEMPTED'   -- round cancelled or skipped
);

-- ──────────────────────────────────────────────────────────
-- 2. TABLES
-- ──────────────────────────────────────────────────────────

-- drive_rounds: the ordered list of rounds configured for a drive
create table public.drive_rounds (
  id             uuid primary key default gen_random_uuid(),
  drive_id       uuid not null references public.drives(id) on delete cascade,
  round_number   smallint not null check (round_number >= 1),
  name           text not null check (length(trim(name)) between 2 and 120),
  round_type     public.round_type not null,
  description    text not null default '',
  is_elimination boolean not null default true,
  passing_score  numeric(6,2),        -- null = no numeric threshold
  max_score      numeric(6,2),        -- null = no numeric score
  scheduled_at   timestamptz,
  status         public.round_status not null default 'PENDING',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dr_unique_order unique (drive_id, round_number),
  constraint dr_passing_le_max check (
    passing_score is null or max_score is null or passing_score <= max_score
  )
);

create trigger drive_rounds_updated
  before update on public.drive_rounds
  for each row execute function public.set_updated_at();

create index drive_rounds_drive_idx on public.drive_rounds(drive_id, round_number);

-- application_rounds: per-student result in each drive round
create table public.application_rounds (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  round_id        uuid not null references public.drive_rounds(id),
  status          public.candidate_round_status not null default 'LOCKED',
  score           numeric(6,2),
  feedback        text,
  evaluated_by    uuid references public.profiles(id),
  evaluated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ar_unique unique (application_id, round_id),
  constraint ar_score_le_max check (score is null or score >= 0)
);

create trigger application_rounds_updated
  before update on public.application_rounds
  for each row execute function public.set_updated_at();

create index application_rounds_app_idx  on public.application_rounds(application_id);
create index application_rounds_round_idx on public.application_rounds(round_id);

-- ──────────────────────────────────────────────────────────
-- 3. RLS
-- ──────────────────────────────────────────────────────────
alter table public.drive_rounds enable row level security;
alter table public.application_rounds enable row level security;

-- drive_rounds: readable by anyone who can see the drive
create policy dr_readable on public.drive_rounds for select using (
  exists(
    select 1 from public.drives d
    where d.id = drive_id
      and (d.status = 'open' or public.is_company_owner(d.id) or public.is_staff())
  )
);

-- application_rounds: readable by the student (own), company owner, or staff
create policy ar_readable on public.application_rounds for select using (
  exists(
    select 1 from public.applications a
    where a.id = application_id
      and (
        a.student_id in (select id from public.students where profile_id = auth.uid())
        or public.is_company_owner(a.drive_id)
        or public.is_staff()
      )
  )
);

-- No direct INSERT/UPDATE/DELETE from browser for either table — all through RPCs.

-- ──────────────────────────────────────────────────────────
-- 4. publish_drive RPC
--    Transitions a drive from draft → open, locks eligibility rules.
--    Requires at least one round to be configured.
-- ──────────────────────────────────────────────────────────
create or replace function public.publish_drive(p_drive uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_drive public.drives%rowtype;
  v_round_count int;
begin
  if auth.uid() is null or not public.is_company_owner(p_drive) then
    raise exception 'Not authorized';
  end if;

  select * into v_drive from public.drives where id = p_drive;
  if not found then raise exception 'Drive not found'; end if;
  if v_drive.status <> 'draft' then
    raise exception 'Only draft drives can be published';
  end if;
  if v_drive.deadline <= now() then
    raise exception 'Cannot publish a drive with a past deadline';
  end if;
  if not exists(select 1 from public.eligibility_rules where drive_id = p_drive) then
    raise exception 'Eligibility rules must be configured before publishing';
  end if;

  select count(*) into v_round_count from public.drive_rounds where drive_id = p_drive;
  if v_round_count = 0 then
    raise exception 'At least one recruitment round must be configured before publishing';
  end if;

  -- Lock eligibility rules and open the drive
  update public.eligibility_rules set locked = true where drive_id = p_drive;
  update public.drives set status = 'open' where id = p_drive;

  perform public.record_audit('DRIVE_PUBLISHED', 'drive', p_drive, null,
    jsonb_build_object('rounds', v_round_count));
end $$;

-- ──────────────────────────────────────────────────────────
-- 5. add_drive_round RPC
--    Company adds a round to their DRAFT drive.
--    Round numbers must be consecutive.
-- ──────────────────────────────────────────────────────────
create or replace function public.add_drive_round(
  p_drive         uuid,
  p_round_number  smallint,
  p_name          text,
  p_round_type    public.round_type,
  p_description   text default '',
  p_is_elimination boolean default true,
  p_passing_score  numeric default null,
  p_max_score      numeric default null,
  p_scheduled_at   timestamptz default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_round_id uuid;
  v_drive    public.drives%rowtype;
  v_max_num  smallint;
begin
  if auth.uid() is null or not public.is_company_owner(p_drive) then
    raise exception 'Not authorized';
  end if;
  select * into v_drive from public.drives where id = p_drive;
  if not found then raise exception 'Drive not found'; end if;
  if v_drive.status <> 'draft' then
    raise exception 'Rounds can only be added to draft drives';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Round name must be at least 2 characters';
  end if;
  -- Ensure round number is next in sequence
  select coalesce(max(round_number), 0) into v_max_num
    from public.drive_rounds where drive_id = p_drive;
  if p_round_number <> v_max_num + 1 then
    raise exception 'Round number must be sequential (next expected: %)', v_max_num + 1;
  end if;
  if p_passing_score is not null and p_max_score is not null
     and p_passing_score > p_max_score then
    raise exception 'Passing score cannot exceed maximum score';
  end if;

  insert into public.drive_rounds(
    drive_id, round_number, name, round_type, description,
    is_elimination, passing_score, max_score, scheduled_at
  ) values (
    p_drive, p_round_number, trim(p_name), p_round_type,
    coalesce(p_description, ''), p_is_elimination,
    p_passing_score, p_max_score, p_scheduled_at
  ) returning id into v_round_id;

  perform public.record_audit('ROUND_ADDED', 'drive', p_drive, null,
    jsonb_build_object('round_number', p_round_number, 'name', p_name, 'type', p_round_type));
  return v_round_id;
end $$;

-- ──────────────────────────────────────────────────────────
-- 6. apply_to_drive_result UPDATE
--    When a student applies to a published drive, automatically
--    create LOCKED application_round rows for all configured rounds.
-- ──────────────────────────────────────────────────────────
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
    v_audit_id := public.record_audit('STUDENT_PROFILE_MISSING', 'drive', p_drive, 'Application blocked because the student record is missing.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, audit_commit_id, risk_score)
      values ('STUDENT_PROFILE_MISSING', 'HIGH', 'A student account attempted to apply without a student record.', v_audit_id, 60);
    return jsonb_build_object('ok', false, 'message', 'Your student profile has not been configured. Contact the placement office.');
  end if;
  select * into v_drive from public.drives where id = p_drive;
  if not found then
    v_audit_id := public.record_audit('INVALID_DRIVE_REFERENCE', 'drive', p_drive, 'Application referenced a drive that does not exist.', '{}'::jsonb, 'BLOCKED');
    return jsonb_build_object('ok', false, 'message', 'Drive was not found.');
  end if;
  if v_drive.status <> 'open' or v_drive.deadline <= now() then
    v_audit_id := public.record_audit('DEADLINE_VIOLATION', 'drive', p_drive, 'Application blocked: drive not open.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values ('LATE_APPLICATION_ATTEMPT', 'MEDIUM', 'Application attempted for closed/expired drive.', p_drive, v_audit_id, 35);
    return jsonb_build_object('ok', false, 'message', 'Drive is not accepting applications.');
  end if;
  select * into v_rules from public.eligibility_rules where drive_id = p_drive;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Drive eligibility rules are unavailable.');
  end if;
  if exists(select 1 from public.applications where drive_id = p_drive and student_id = v_student.id) then
    return jsonb_build_object('ok', false, 'message', 'You have already applied to this drive.');
  end if;

  -- Eligibility checks
  if v_student.cgpa < v_rules.min_cgpa then
    v_failed_rules := array_append(v_failed_rules, format('CGPA %s is below required minimum %s.', v_student.cgpa, v_rules.min_cgpa));
  end if;
  if v_student.backlogs > v_rules.max_backlogs then
    v_failed_rules := array_append(v_failed_rules, 'Backlog limit exceeded.');
  end if;
  if not (lower(v_student.branch) = any(select lower(b) from unnest(v_rules.allowed_branches) b)) then
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
      array_to_string(v_failed_rules, ' '), jsonb_build_object('eligible', false), 'BLOCKED');
    return jsonb_build_object('ok', false, 'message', 'You do not meet the eligibility requirements.', 'failedRules', v_failed_rules);
  end if;

  -- Create application
  insert into public.applications(drive_id, student_id, status)
    values (p_drive, v_student.id, 'ELIGIBLE') returning id into v_application_id;
  insert into public.eligibility_results(application_id, eligible, engine_version)
    values (v_application_id, true, '2.0.0');

  -- Initialise application_rounds for each configured round (all LOCKED initially)
  -- Round 1 gets PENDING status (active and awaiting evaluation)
  for v_round in
    select id, round_number from public.drive_rounds
    where drive_id = p_drive order by round_number
  loop
    insert into public.application_rounds(application_id, round_id, status)
      values (
        v_application_id,
        v_round.id,
        case when v_round.round_number = 1 then 'PENDING' else 'LOCKED' end
      );
  end loop;

  perform public.record_audit('APPLICATION_SUBMITTED', 'application', v_application_id, null,
    jsonb_build_object('drive_id', p_drive));
  perform public.record_audit('ELIGIBILITY_CHECKED', 'application', v_application_id, null,
    jsonb_build_object('eligible', true));
  return jsonb_build_object('ok', true, 'applicationId', v_application_id);
end $$;

-- ──────────────────────────────────────────────────────────
-- 7. evaluate_round RPC
--    Company owner or authorized staff records a round result.
--    If the student passes an elimination round, the next round
--    is automatically unlocked (set to PENDING).
--    If the student fails an elimination round, their application
--    status is set to REJECTED.
-- ──────────────────────────────────────────────────────────
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

  select * into v_ar from public.application_rounds where id = p_application_round_id for update;
  if not found then raise exception 'Application round not found'; end if;
  if v_ar.status not in ('PENDING', 'ACTIVE') then
    raise exception 'This round result has already been recorded or is locked';
  end if;

  select * into v_round from public.drive_rounds where id = v_ar.round_id;
  select * into v_app  from public.applications  where id = v_ar.application_id;

  -- Authorization: company owner OR staff
  if not (public.is_company_owner(v_app.drive_id) or public.is_staff()) then
    perform public.record_audit('UNAUTHORIZED_EVALUATION_ATTEMPT', 'application_round',
      p_application_round_id, 'Actor is not authorized to evaluate this round.', '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values ('UNAUTHORIZED_EVALUATION', 'HIGH', 'Unauthorized evaluation attempt blocked.',
              v_app.drive_id,
              (select public.record_audit('UNAUTHORIZED_EVALUATION_ATTEMPT', 'application_round',
                p_application_round_id, null, '{}'::jsonb, 'BLOCKED')),
              75);
    raise exception 'Not authorized to evaluate this round';
  end if;

  -- Prevent a student from evaluating themselves (belt-and-suspenders)
  if v_caller_role = 'student' then
    raise exception 'Students cannot evaluate rounds';
  end if;

  -- Validate score against max_score
  if p_score is not null and v_round.max_score is not null and p_score > v_round.max_score then
    raise exception 'Score % exceeds maximum score % for this round', p_score, v_round.max_score;
  end if;

  -- Only allowed terminal statuses for evaluation
  if p_status not in ('PASSED', 'FAILED', 'ABSENT', 'NOT_ATTEMPTED') then
    raise exception 'Invalid evaluation status. Use PASSED, FAILED, ABSENT, or NOT_ATTEMPTED';
  end if;

  -- Record evaluation
  update public.application_rounds
    set status       = p_status,
        score        = p_score,
        feedback     = p_feedback,
        evaluated_by = auth.uid(),
        evaluated_at = now()
    where id = p_application_round_id;

  -- Handle round progression
  if p_status = 'PASSED' then
    -- Unlock next round if it exists
    select dr.* into v_next_round
      from public.drive_rounds dr
      where dr.drive_id = v_round.drive_id
        and dr.round_number = v_round.round_number + 1;

    if found then
      update public.application_rounds
        set status = 'PENDING'
        where application_id = v_ar.application_id
          and round_id = v_next_round.id;
    else
      -- No more rounds → SELECTED
      update public.applications set status = 'SELECTED'
        where id = v_ar.application_id;
      perform public.record_audit('CANDIDATE_SELECTED', 'application', v_ar.application_id,
        null, jsonb_build_object('drive_id', v_app.drive_id));
    end if;

  elsif p_status in ('FAILED', 'ABSENT') and v_round.is_elimination then
    -- Elimination round failure → REJECTED
    update public.applications set status = 'REJECTED'
      where id = v_ar.application_id;
    perform public.record_audit('CANDIDATE_REJECTED_ROUND', 'application', v_ar.application_id,
      format('Failed round %s: %s', v_round.round_number, v_round.name),
      jsonb_build_object('round_id', v_round.id, 'drive_id', v_app.drive_id));
  end if;

  perform public.record_audit('ROUND_EVALUATED', 'application_round', p_application_round_id, p_feedback,
    jsonb_build_object(
      'round_id',      v_round.id,
      'round_number',  v_round.round_number,
      'drive_id',      v_app.drive_id,
      'application_id',v_ar.application_id,
      'status',        p_status,
      'score',         p_score
    ));

  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ──────────────────────────────────────────────────────────
-- 8. get_my_application_rounds RPC
--    Students retrieve their round progress for a given application.
--    Never reveals other students' data.
-- ──────────────────────────────────────────────────────────
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
      'id',            ar.id,
      'round_number',  dr.round_number,
      'name',          dr.name,
      'round_type',    dr.round_type,
      'description',   dr.description,
      'is_elimination',dr.is_elimination,
      'max_score',     dr.max_score,
      'status',        ar.status,
      'score',         ar.score,
      'feedback',      case when ar.status in ('PASSED','FAILED','ABSENT','NOT_ATTEMPTED') then ar.feedback else null end,
      'evaluated_at',  ar.evaluated_at
    ) order by dr.round_number
  ) into v_result
  from public.application_rounds ar
  join public.drive_rounds dr on dr.id = ar.round_id
  where ar.application_id = p_application;

  return coalesce(v_result, '[]'::jsonb);
end $$;

-- ──────────────────────────────────────────────────────────
-- 9. get_drive_applicants RPC
--    Company/staff retrieves all applicants for a drive with
--    their current round status.
-- ──────────────────────────────────────────────────────────
create or replace function public.get_drive_applicants(p_drive uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (public.is_company_owner(p_drive) or public.is_staff()) then
    raise exception 'Not authorized';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'application_id',  a.id,
      'application_status', a.status,
      'student_id',      s.id,
      'student_name',    p.name,
      'roll_number',     s.roll_number,
      'branch',          s.branch,
      'cgpa',            s.cgpa,
      'applied_at',      a.applied_at,
      'rounds', (
        select jsonb_agg(
          jsonb_build_object(
            'application_round_id', ar.id,
            'round_number',  dr.round_number,
            'name',          dr.name,
            'round_type',    dr.round_type,
            'status',        ar.status,
            'score',         ar.score,
            'max_score',     dr.max_score,
            'feedback',      ar.feedback,
            'evaluated_by_name', ev.name,
            'evaluated_at',  ar.evaluated_at
          ) order by dr.round_number
        )
        from public.application_rounds ar
        join public.drive_rounds dr on dr.id = ar.round_id
        left join public.profiles ev on ev.id = ar.evaluated_by
        where ar.application_id = a.id
      )
    )
  ) into v_result
  from public.applications a
  join public.students s on s.id = a.student_id
  join public.profiles p on p.id = s.profile_id
  where a.drive_id = p_drive
  order by a.applied_at;

  return coalesce(v_result, '[]'::jsonb);
end $$;

-- ──────────────────────────────────────────────────────────
-- 10. GRANTS
-- ──────────────────────────────────────────────────────────
revoke all on function
  public.publish_drive(uuid),
  public.add_drive_round(uuid, smallint, text, public.round_type, text, boolean, numeric, numeric, timestamptz),
  public.evaluate_round(uuid, public.candidate_round_status, numeric, text),
  public.get_my_application_rounds(uuid),
  public.get_drive_applicants(uuid)
from public, anon;

grant execute on function
  public.publish_drive(uuid),
  public.add_drive_round(uuid, smallint, text, public.round_type, text, boolean, numeric, numeric, timestamptz),
  public.evaluate_round(uuid, public.candidate_round_status, numeric, text),
  public.get_my_application_rounds(uuid),
  public.get_drive_applicants(uuid)
to authenticated;
