-- =============================================================================
-- PlaceGuard: Fix json/jsonb type mismatch in start_test_attempt
-- 20260820040001_fix_start_test_attempt_json_type.sql
--
-- Root cause:
--   start_test_attempt declares v_questions as jsonb (line 519) but populates
--   it via json_agg() (lines 565, 625) which returns json — NOT jsonb.
--   The COALESCE expressions on lines 598 and 660:
--       coalesce(v_questions, '[]'::json)
--   fail because PostgreSQL cannot resolve a COALESCE between a jsonb variable
--   and a json literal. Error:
--       COALESCE could not convert type json to jsonb
--
-- Fix:
--   Replace json_agg() → jsonb_agg() everywhere inside start_test_attempt.
--   Update the COALESCE defaults to '[]'::jsonb (consistent with v_questions jsonb).
--   The inner subquery options also use json_agg() → jsonb_agg().
--   No schema changes. No data changes. One function replacement.
-- =============================================================================

create or replace function public.start_test_attempt(p_assessment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_student      public.students%rowtype;
  v_assessment   public.assessments%rowtype;
  v_attempt_id   uuid;
  v_app_round_id uuid;
  v_question_ids uuid[];
  v_questions    jsonb;  -- jsonb throughout; use jsonb_agg() to populate
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

    -- Fetch question order for existing attempt
    select array_agg(aq.question_id order by aq.display_order)
    into v_question_ids
    from public.assessment_questions aq
    where aq.assessment_id = p_assessment;

    -- Build question list (jsonb_agg so v_questions stays jsonb)
    select jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'topic', q.topic,
        'difficulty', q.difficulty,
        'marks', q.marks,
        'options', (
          select jsonb_agg(
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
      'questions', coalesce(v_questions, '[]'::jsonb),
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
  -- Use jsonb_agg() so the result is jsonb (matches v_questions declaration)
  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'question_text', q.question_text,
      'question_type', q.question_type,
      'topic', q.topic,
      'difficulty', q.difficulty,
      'marks', q.marks,
      'options', (
        select jsonb_agg(
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
    'questions', coalesce(v_questions, '[]'::jsonb),
    'resumed', false
  );
end $$;

-- Re-grant execute (CREATE OR REPLACE can drop grants in some Postgres configs)
grant execute on function public.start_test_attempt(uuid) to authenticated;