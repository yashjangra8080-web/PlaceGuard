-- =============================================================================
-- PlaceGuard: Fix nested-aggregate error in submit_mcq_attempt and
--             json/jsonb type mismatch in get_attempt_result
-- 20260820050001_fix_submit_nested_aggregate.sql
--
-- Bug 1 — submit_mcq_attempt (lines 780-794):
--   jsonb_agg(jsonb_build_object(..., sum(...), count(...)))
--   PostgreSQL forbids aggregate functions (sum, count) nested inside another
--   aggregate (jsonb_agg). Error: "aggregate function calls cannot be nested"
--
--   Fix: pre-aggregate the per-(topic, difficulty) stats in a CTE, then
--   wrap the pre-computed rows with jsonb_agg in the outer SELECT.
--
-- Bug 2 — get_attempt_result (line 934):
--   coalesce(v_questions, '[]'::json)
--   v_questions is declared jsonb but '[]'::json is json → same COALESCE type
--   mismatch as was fixed in start_test_attempt.
--   Fix: change '[]'::json → '[]'::jsonb and use jsonb_agg throughout.
--
-- No schema changes. No data changes. Two function replacements only.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: submit_mcq_attempt
-- ─────────────────────────────────────────────────────────────────────────────
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
      v_unanswered := v_unanswered + 1;
    else
      if v_q.question_type = 'MCQ_SINGLE' then
        v_is_correct := (v_selected_ids[1] = any(v_correct_ids)) and array_length(v_correct_ids,1) = 1;
      elsif v_q.question_type = 'MCQ_MULTI' then
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

  -- Build section_results from topic/difficulty breakdown.
  -- FIX: pre-aggregate (sum, count) in a subquery first, then wrap with
  -- jsonb_agg in the outer query. This avoids nesting aggregate inside aggregate.
  select jsonb_agg(
    jsonb_build_object(
      'topic',      grp.topic,
      'difficulty', grp.difficulty,
      'correct',    grp.correct_count,
      'total',      grp.total_count,
      'score',      grp.topic_score,
      'max_score',  grp.topic_max
    )
  ) into v_section_data
  from (
    select
      q.topic,
      q.difficulty,
      coalesce(sum(case when sa.is_correct then 1 else 0 end), 0) as correct_count,
      count(q.id)                                                   as total_count,
      coalesce(sum(case when sa.is_correct then q.marks else 0 end), 0) as topic_score,
      sum(q.marks)                                                  as topic_max
    from public.assessment_questions aq
    join public.questions q on q.id = aq.question_id
    left join public.submitted_answers sa
           on sa.question_id = q.id and sa.attempt_id = p_attempt
    where aq.assessment_id = v_attempt.assessment_id
    group by q.topic, q.difficulty
  ) grp;

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

  -- Trigger round progression via evaluate_round
  perform public.evaluate_round(
    p_application_round_id := v_attempt.application_round_id,
    p_status               := case when v_passed
                                then 'PASSED'::public.candidate_round_status
                                else 'FAILED'::public.candidate_round_status end,
    p_score                := v_total_score,
    p_feedback             := 'Auto-evaluated: ' || case when v_passed then 'PASSED' else 'FAILED' end
  );

  perform public.record_audit('TEST_SUBMITTED', 'assessment', v_attempt.assessment_id, null,
    jsonb_build_object('attempt', p_attempt, 'score', v_total_score, 'passed', v_passed, 'student', auth.uid()));

  return jsonb_build_object(
    'result_id',       v_result_id,
    'attempt_id',      p_attempt,
    'total_score',     v_total_score,
    'max_score',       v_max_score,
    'percentage',      case when v_max_score > 0 then round((v_total_score / v_max_score) * 100, 2) else 0 end,
    'correct_count',   v_correct,
    'incorrect_count', v_incorrect,
    'unanswered_count',v_unanswered,
    'accuracy',        case when (v_correct + v_incorrect) > 0 then round((v_correct::numeric / (v_correct + v_incorrect)) * 100, 2) else 0 end,
    'time_taken_seconds', v_time_taken,
    'passed',          v_passed
  );
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: get_attempt_result — json/jsonb COALESCE mismatch
--   v_questions is jsonb but '[]'::json is json → must be '[]'::jsonb
--   Also change json_agg → jsonb_agg throughout for consistency.
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Use jsonb_agg so v_questions (jsonb) stays consistent; COALESCE default is jsonb
  if v_assessment.allow_review then
    select jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'topic', q.topic,
        'difficulty', q.difficulty,
        'marks', q.marks,
        'explanation', q.explanation,
        'options', (
          select jsonb_agg(
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
    'attempt_id',          p_attempt,
    'assessment_title',    v_assessment.title,
    'status',              v_attempt.status,
    'started_at',          v_attempt.started_at,
    'submitted_at',        v_attempt.submitted_at,
    'time_taken_seconds',  v_result.time_taken_seconds,
    'total_score',         v_result.total_score,
    'max_score',           v_result.max_score,
    'percentage',          v_result.percentage,
    'correct_count',       v_result.correct_count,
    'incorrect_count',     v_result.incorrect_count,
    'unanswered_count',    v_result.unanswered_count,
    'accuracy',            v_result.accuracy,
    'passed',              v_result.passed,
    'passing_score',       v_assessment.passing_score,
    'section_results',     v_result.section_results,
    'round_status',        v_app_round.status,
    'allow_review',        v_assessment.allow_review,
    'question_review',     coalesce(v_questions, '[]'::jsonb)
  );
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Re-grant execute
-- ─────────────────────────────────────────────────────────────────────────────
grant execute on function
  public.submit_mcq_attempt(uuid, jsonb),
  public.get_attempt_result(uuid)
to authenticated;