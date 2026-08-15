import { supabase } from '../lib/supabase'

const req = () => { if (!supabase) throw new Error('Supabase is not configured.') }

// ── Test attempt flow ─────────────────────────────────────────────────────────
export async function startTestAttempt(assessmentId) {
  req()
  const { data, error } = await supabase.rpc('start_test_attempt', { p_assessment: assessmentId })
  if (error) throw error
  return data
}

export async function submitMcqAttempt(attemptId, answers) {
  req()
  const { data, error } = await supabase.rpc('submit_mcq_attempt', {
    p_attempt: attemptId,
    p_answers: answers,
  })
  if (error) throw error
  return data
}

export async function getAttemptResult(attemptId) {
  req()
  const { data, error } = await supabase.rpc('get_attempt_result', { p_attempt: attemptId })
  if (error) throw error
  return data
}

export async function getAssessmentForRound(roundId) {
  req()
  const { data, error } = await supabase.rpc('get_assessment_for_round', { p_round: roundId })
  if (error) throw error
  return data
}

// ── Company assessment management ─────────────────────────────────────────────
export async function getAssessmentByRound(driveRoundId) {
  req()
  const { data, error } = await supabase
    .from('assessments')
    .select('*, assessment_questions(count)')
    .eq('drive_round_id', driveRoundId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createAssessment({ driveRoundId, title, instructions, durationMinutes, passingScore, negativeMarking, negativeFraction, shuffleQuestions, shuffleOptions, allowReview }) {
  req()
  const { data, error } = await supabase.rpc('create_assessment_for_round', {
    p_drive_round: driveRoundId,
    p_title: title,
    p_instructions: instructions ?? '',
    p_duration_minutes: durationMinutes,
    p_passing_score: passingScore ?? null,
    p_negative_marking: negativeMarking ?? false,
    p_negative_fraction: negativeFraction ?? 0.25,
    p_shuffle_questions: shuffleQuestions ?? true,
    p_shuffle_options: shuffleOptions ?? true,
    p_allow_review: allowReview ?? true,
  })
  if (error) throw error
  return data
}

export async function activateAssessment(assessmentId) {
  req()
  const { data, error } = await supabase.rpc('set_assessment_active', { p_assessment: assessmentId, p_is_active: true })
  if (error) throw error
  return data
}

export async function deactivateAssessment(assessmentId) {
  req()
  const { data, error } = await supabase.rpc('set_assessment_active', { p_assessment: assessmentId, p_is_active: false })
  if (error) throw error
  return data
}

// ── Question bank ─────────────────────────────────────────────────────────────
export async function getCompanyQuestions(companyId, { topic, difficulty } = {}) {
  req()
  let q = supabase
    .from('questions')
    .select('id, question_text, question_type, topic, difficulty, marks, explanation, ai_generated, created_at, question_options(id, option_text, is_correct, display_order)')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (topic) q = q.eq('topic', topic)
  if (difficulty) q = q.eq('difficulty', difficulty)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createQuestion({ assessmentId, questionText, questionType, topic, difficulty, marks, explanation, options }) {
  req()
  const { data, error } = await supabase.rpc('add_question_to_assessment', {
    p_assessment: assessmentId,
    p_question_text: questionText,
    p_question_type: questionType ?? 'MCQ_SINGLE',
    p_topic: topic ?? 'General',
    p_difficulty: difficulty ?? 'MEDIUM',
    p_marks: marks ?? 1,
    p_explanation: explanation ?? null,
    p_options: options,
  })
  if (error) throw error
  return data
}

export async function removeQuestionFromAssessment(assessmentId, questionId) {
  req()
  const { error } = await supabase.rpc('remove_question_from_assessment', {
    p_assessment: assessmentId,
    p_question: questionId,
  })
  if (error) throw error
}

export async function getAssessmentQuestions(assessmentId) {
  req()
  const { data, error } = await supabase
    .from('assessment_questions')
    .select('display_order, questions(id, question_text, question_type, topic, difficulty, marks, explanation, question_options(id, option_text, is_correct, display_order))')
    .eq('assessment_id', assessmentId)
    .order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(row => ({ ...row.questions, display_order: row.display_order }))
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export async function getDriveAssessmentAnalytics(driveId) {
  req()
  const { data, error } = await supabase.rpc('get_drive_assessment_analytics', { p_drive: driveId })
  if (error) throw error
  return data ?? []
}

// ── AI question draft flow ────────────────────────────────────────────────────
export async function getAiGeneratedQuestions(companyId, { status } = {}) {
  req()
  let q = supabase
    .from('ai_generated_questions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('review_status', status)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function approveAiQuestion(draftId, assessmentId) {
  req()
  const { data, error } = await supabase.rpc('approve_ai_question_for_assessment', {
    p_draft: draftId,
    p_assessment: assessmentId,
  })
  if (error) throw error
  return data
}

export async function rejectAiQuestion(draftId) {
  req()
  const { error } = await supabase.rpc('reject_ai_question_draft', { p_draft: draftId })
  if (error) throw error
}

// ── Admin change requests ─────────────────────────────────────────────────────
export async function requestAdminChange({ entityType, entityId, action, oldValue, newValue, reason }) {
  req()
  const { data, error } = await supabase.rpc('request_admin_change', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_action: action,
    p_old_value: oldValue ?? null,
    p_new_value: newValue,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function approveAdminChange(requestId, decision, reason) {
  req()
  const { error } = await supabase.rpc('approve_admin_change', {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: reason,
  })
  if (error) throw error
}

export async function getAdminChangeRequests({ status } = {}) {
  req()
  let q = supabase
    .from('admin_change_requests')
    .select('*, change_request_approvals(decision, reason, created_at)')
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getMyChangeRequests() {
  req()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('admin_change_requests')
    .select('*, change_request_approvals(decision, reason, created_at)')
    .eq('requested_by', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getPendingChangeRequests() {
  req()
  const { data, error } = await supabase
    .from('admin_change_requests')
    .select('*')
    .eq('status', 'PENDING_TNP_APPROVAL')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}


