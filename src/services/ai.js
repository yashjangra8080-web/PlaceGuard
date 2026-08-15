import { supabase } from '../lib/supabase'

// All AI calls go through our Supabase Edge Function.
// The GEMINI_API_KEY is stored ONLY in Supabase secrets — never exposed to the browser.
async function callAiAssistant(operation, payload) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated. Please log in.')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: apiKey,
    },
    body: JSON.stringify({ operation, payload }),
    signal: AbortSignal.timeout(30000), // 30 second timeout
  })

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('AI service returned an invalid response. Please try again.')
  }

  if (!result.ok) throw new Error(result.error ?? 'AI request failed. Please try again.')
  return result.data
}

// ── AI Features ───────────────────────────────────────────────────────────────

/** Generate MCQ questions for a given role/topic/difficulty. Returns structured draft array. */
export const generateQuestions = (payload) =>
  callAiAssistant('generate_questions', payload)

/** Generate a full recruitment process plan for a job role. Returns structured plan. */
export const generateRecruitmentPlan = (payload) =>
  callAiAssistant('generate_recruitment_plan', payload)

/** Analyze a candidate's multi-round performance. Returns insights (advisory only). */
export const candidateAnalysis = (payload) =>
  callAiAssistant('candidate_analysis', payload)

/** Generate an aggregate recruitment summary for a company drive. */
export const companyRecruitmentSummary = (payload) =>
  callAiAssistant('company_recruitment_summary', payload)

/** Generate a T&P governance summary (requires tnp_head/admin role server-side). */
export const governanceSummary = (payload) =>
  callAiAssistant('governance_summary', payload)

/** Generate interview question suggestions for a role/round. */
export const generateInterviewQuestions = (payload) =>
  callAiAssistant('generate_interview_questions', payload)

// ── Save AI drafts to database ────────────────────────────────────────────────

/** Save AI-generated question drafts to ai_generated_questions for human review. */
export async function saveAiGeneratedQuestions(companyId, requestType, context, questions) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (requestType !== 'QUESTIONS') throw new Error('Unsupported AI draft type.')
  const { data, error } = await supabase.rpc('store_ai_question_drafts', {
    p_company: companyId,
    p_context: context,
    p_questions: questions,
  })
  if (error) throw error
  const draftIds = data?.draft_ids ?? []
  if (!draftIds.length) return { request: { id: data?.request_id }, drafts: [] }
  const { data: drafts, error: draftsError } = await supabase
    .from('ai_generated_questions')
    .select('*')
    .in('id', draftIds)
  if (draftsError) throw draftsError
  return { request: { id: data.request_id }, drafts: drafts ?? [] }
}
