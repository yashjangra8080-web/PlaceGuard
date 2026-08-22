-- =============================================================================
-- PlaceGuard: Fix "Not authorized to evaluate this round" during student
--             assessment submission.
-- 20260820060001_fix_evaluate_round_auth_for_submission.sql
--
-- Root cause:
--   submit_mcq_attempt (SECURITY DEFINER) calls evaluate_round at the end of
--   scoring. Even though submit_mcq_attempt runs as DB owner, auth.uid() and
--   current_role() still reflect the original caller (the student). Inside
--   evaluate_round the role-gate:
--       if not (is_company_owner(...) or is_staff()) then
--           raise exception 'Not authorized to evaluate this round';
--       end if;
--       if v_caller_role = 'student' then
--           raise exception 'Students cannot evaluate rounds';
--       end if;
--   always blocks the student, even when the call originates from the trusted
--   server-side submission path.
--
-- Fix strategy:
--   1. Extract round-progression logic into private SECURITY DEFINER helper
--      public._apply_round_result(). NOT granted to 'authenticated', so
--      students cannot invoke it directly from the browser.
--
--   2. evaluate_round (public API) keeps its full role-gate (company/staff).
--      After passing the gate it delegates to _apply_round_result().
--
--   3. submit_mcq_attempt calls _apply_round_result() directly, bypassing the
--      caller-role gate. Ownership is already verified earlier in the function.
--
-- Security properties preserved:
--   * Student CANNOT call evaluate_round directly — role-gate is intact.
--   * Student CANNOT call _apply_round_result directly — not granted.
--   * Student CAN submit own attempt → submit_mcq_attempt (verifies ownership)
--     → _apply_round_result (private helper).
--   * Company/staff can still call evaluate_round for manual evaluation.
--   * Score and PASS/FAIL remain 100% server-side.
-- =============================================================================

-- Step 1: Private internal helper — no role-gate, not granted to authenticated.
create or replace function public._apply_round_result(
  p_application_round_id uuid,
  p_status               public.candidate_round_status,
  p_score                numeric,
  p_feedback             text,
  p_evaluated_by         uuid
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_ar         public.application_rounds%rowtype;
  v_round      public.drive_rounds%rowtype;
  v_app        public.applications%rowtype;
  v_next_round public.drive_rounds%rowtype;
begin
  select * into v_ar from public.application_rounds
    where id = p_application_round_id for update;
  if not found then raise exception 'Application round not found'; end if;

  if v_ar.status <> 'PENDING'::public.candidate_round_status then
    raise exception 'This round result has already been recorded or is locked';
  end if;

  select * into v_round from public.drive_rounds where id = v_ar.round_id;
  select * into v_app  from public.applications  where id = v_ar.application_id;

  if p_score is not null and v_round.max_score is not null and p_score > v_round.max_score then
    raise exception 'Score % exceeds maximum score % for this round', p_score, v_round.max_score;
  end if;

  if p_status not in ('PASSED','FAILED','ABSENT','NOT_ATTEMPTED') then
    raise exception 'Invalid evaluation status';
  end if;

  update public.application_rounds
    set status       = p_status,
        score        = p_score,
        feedback     = p_feedback,
        evaluated_by = p_evaluated_by,
        evaluated_at = now()
    where id = p_application_round_id;

  if p_status = 'PASSED' then
    select dr.* into v_next_round
      from public.drive_rounds dr
      where dr.drive_id     = v_round.drive_id
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

  perform public.record_audit('ROUND_EVALUATED', 'application_round', p_application_round_id,
    p_feedback, jsonb_build_object(
      'round_id', v_round.id, 'round_number', v_round.round_number,
      'drive_id', v_app.drive_id, 'application_id', v_ar.application_id,
      'status', p_status, 'score', p_score));
end $$;

-- Explicitly revoke from public and authenticated — this is private infrastructure
revoke all on function public._apply_round_result(uuid, public.candidate_round_status, numeric, text, uuid) from public;
revoke all on function public._apply_round_result(uuid, public.candidate_round_status, numeric, text, uuid) from authenticated;

-- Step 2: evaluate_round — role-gate preserved, delegates to helper.
create or replace function public.evaluate_round(
  p_application_round_id uuid,
  p_status               public.candidate_round_status,
  p_score                numeric default null,
  p_feedback             text    default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_ar          public.application_rounds%rowtype;
  v_app         public.applications%rowtype;
  v_caller_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_caller_role := public.current_role();

  select * into v_ar  from public.application_rounds where id = p_application_round_id;
  if not found then raise exception 'Application round not found'; end if;
  select * into v_app from public.applications where id = v_ar.application_id;

  if not (public.is_company_owner(v_app.drive_id) or public.is_staff()) then
    perform public.record_audit('UNAUTHORIZED_EVALUATION_ATTEMPT', 'application_round',
      p_application_round_id, 'Actor is not authorized to evaluate this round.',
      '{}'::jsonb, 'BLOCKED');
    insert into public.anomaly_alerts(type, severity, description, drive_id, audit_commit_id, risk_score)
      values ('UNAUTHORIZED_EVALUATION', 'HIGH', 'Unauthorized evaluation attempt blocked.',
        v_app.drive_id,
        (select public.record_audit('UNAUTHORIZED_EVALUATION_ATTEMPT', 'application_round',
          p_application_round_id, null, '{}'::jsonb, 'BLOCKED')), 75);
    raise exception 'Not authorized to evaluate this round';
  end if;

  if v_caller_role = 'student' then
    raise exception 'Students cannot evaluate rounds';
  end if;

  perform public._apply_round_result(
    p_application_round_id, p_status, p_score, p_feedback, auth.uid());

  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

grant execute on function
  public.evaluate_round(uuid, public.candidate_round_status, numeric, text)
to authenticated;

-- Step 3: submit_mcq_attempt — calls _apply_round_result instead of evaluate_round.
create or replace function public.submit_mcq_attempt(
  p_attempt   uuid,
  p_answers   jsonb
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

  select * into v_attempt from public.test_attempts where id = p_attempt for update;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.student_profile_id <> auth.uid() then raise exception 'Not your attempt'; end if;
  if v_attempt.status <> 'IN_PROGRESS' then raise exception 'Attempt already submitted or closed'; end if;

  select * into v_assessment from public.assessments where id = v_attempt.assessment_id;

  v_deadline := v_attempt.started_at + (v_assessment.duration_minutes * interval '1 minute') + interval '30 seconds';
  if now() > v_deadline then
    update public.test_attempts set status = 'TIMEOUT', submitted_at = now() where id = p_attempt;
    raise exception 'Test time has expired. Your attempt has been recorded as TIMEOUT.';
  end if;

  v_time_taken := extract(epoch from (now() - v_attempt.started_at))::integer;

  select count(*) into v_total_q from public.assessment_questions where assessment_id = v_attempt.assessment_id;

  for v_ans in select * from jsonb_array_elements(p_answers) loop
    select * into v_q from public.questions where id = (v_ans->>'question_id')::uuid;
    if not found then continue; end if;

    select array_agg(id) into v_correct_ids
    from public.question_options
    where question_id = v_q.id and is_correct = true;

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

    insert into public.submitted_answers (
      attempt_id, question_id, selected_option_ids, is_correct, marks_awarded
    ) values (
      p_attempt, v_q.id, v_selected_ids, v_is_correct, v_marks
    ) on conflict (attempt_id, question_id) do nothing;
  end loop;

  v_unanswered := v_unanswered + (v_total_q - v_correct - v_incorrect - v_unanswered);
  v_total_score := greatest(0, v_total_score);

  if v_assessment.max_score > 0 then
    v_max_score := v_assessment.max_score;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'topic', grp.topic, 'difficulty', grp.difficulty,
      'correct', grp.correct_count, 'total', grp.total_count,
      'score', grp.topic_score, 'max_score', grp.topic_max
    )
  ) into v_section_data
  from (
    select q.topic, q.difficulty,
      coalesce(sum(case when sa.is_correct then 1 else 0 end), 0) as correct_count,
      count(q.id) as total_count,
      coalesce(sum(case when sa.is_correct then q.marks else 0 end), 0) as topic_score,
      sum(q.marks) as topic_max
    from public.assessment_questions aq
    join public.questions q on q.id = aq.question_id
    left join public.submitted_answers sa on sa.question_id = q.id and sa.attempt_id = p_attempt
    where aq.assessment_id = v_attempt.assessment_id
    group by q.topic, q.difficulty
  ) grp;

  v_passed := v_assessment.passing_score is null or v_total_score >= v_assessment.passing_score;

  update public.test_attempts
    set status = 'SUBMITTED', submitted_at = now(), time_taken_seconds = v_time_taken
    where id = p_attempt;

  insert into public.assessment_results (
    attempt_id, assessment_id, student_profile_id, application_round_id,
    total_score, max_score, percentage, correct_count, incorrect_count, unanswered_count,
    accuracy, time_taken_seconds, passed, section_results
  ) values (
    p_attempt, v_attempt.assessment_id, auth.uid(), v_attempt.application_round_id,
    v_total_score, v_max_score,
    case when v_max_score > 0 then round((v_total_score / v_max_score) * 100, 2) else 0 end,
    v_correct, v_incorrect, v_unanswered,
    case when (v_correct + v_incorrect) > 0 then round((v_correct::numeric / (v_correct + v_incorrect)) * 100, 2) else 0 end,
    v_time_taken, v_passed,
    coalesce(v_section_data, '[]'::jsonb)
  ) returning id into v_result_id;

  -- Call private helper directly — bypasses the role-gate in evaluate_round.
  -- Safe because:
  --   (a) _apply_round_result is NOT granted to authenticated
  --   (b) application_round_id comes from the validated attempt row, not user input
  --   (c) p_score/p_passed are computed server-side above, not from client
  perform public._apply_round_result(
    v_attempt.application_round_id,
    case when v_passed then 'PASSED'::public.candidate_round_status else 'FAILED'::public.candidate_round_status end,
    v_total_score,
    'Auto-evaluated: ' || case when v_passed then 'PASSED' else 'FAILED' end,
    auth.uid()
  );

  perform public.record_audit('TEST_SUBMITTED', 'assessment', v_attempt.assessment_id, null,
    jsonb_build_object('attempt', p_attempt, 'score', v_total_score, 'passed', v_passed, 'student', auth.uid()));

  return jsonb_build_object(
    'result_id', v_result_id, 'attempt_id', p_attempt,
    'total_score', v_total_score, 'max_score', v_max_score,
    'percentage', case when v_max_score > 0 then round((v_total_score / v_max_score) * 100, 2) else 0 end,
    'correct_count', v_correct, 'incorrect_count', v_incorrect, 'unanswered_count', v_unanswered,
    'accuracy', case when (v_correct + v_incorrect) > 0 then round((v_correct::numeric / (v_correct + v_incorrect)) * 100, 2) else 0 end,
    'time_taken_seconds', v_time_taken, 'passed', v_passed
  );
end $$;

grant execute on function public.submit_mcq_attempt(uuid, jsonb) to authenticated;