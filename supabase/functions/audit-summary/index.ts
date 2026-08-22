import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

// GEMINI_API_KEY is stored ONLY in Supabase secrets — never in client code
async function summariseWithGemini(facts: Record<string, number>, driveTitle: string): Promise<string | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return null
  try {
    const { GoogleGenAI } = await import('https://esm.sh/@google/genai@1.38.0')
    const ai = new GoogleGenAI({ apiKey })
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite'
    const prompt = `Summarise ONLY these verified facts about placement drive "${driveTitle}" in exactly 2 factual sentences. Do NOT add, infer, or alter any numbers. Facts: ${JSON.stringify(facts)}`
    const response = await ai.models.generateContent({ model, contents: prompt })
    return response.text?.trim() ?? null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) throw new Error('Authentication is required.')
    const { driveId } = await request.json()
    if (typeof driveId !== 'string' || !/^[0-9a-f-]{36}$/i.test(driveId)) throw new Error('Invalid drive reference.')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) throw new Error('Authentication is required.')
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    const { data: drive } = await admin.from('drives').select('id,company_id,title').eq('id', driveId).single()
    const { data: company } = await admin.from('companies').select('profile_id').eq('id', drive.company_id).single()
    if (!profile || !drive || !company || !(['tnp_head', 'admin'].includes(profile.role) || (profile.role === 'company' && company.profile_id === user.id))) throw new Error('Not authorized.')
    const [{ count: applications }, { count: eligible }, { count: shortlisted }, { count: proposals }, { count: anomalies }, { count: blocked }] = await Promise.all([
      admin.from('applications').select('*', { count: 'exact', head: true }).eq('drive_id', driveId), admin.from('applications').select('*', { count: 'exact', head: true }).eq('drive_id', driveId).eq('status', 'ELIGIBLE'), admin.from('shortlists').select('*', { count: 'exact', head: true }).eq('drive_id', driveId).eq('status', 'SHORTLISTED'), admin.from('shortlist_proposals').select('*', { count: 'exact', head: true }).eq('drive_id', driveId), admin.from('anomaly_alerts').select('*', { count: 'exact', head: true }).eq('drive_id', driveId), admin.from('audit_commits').select('*', { count: 'exact', head: true }).contains('metadata', { drive_id: driveId }).eq('status', 'BLOCKED'),
    ])
    const facts = { applications: applications || 0, eligible: eligible || 0, shortlisted: shortlisted || 0, proposals: proposals || 0, anomalies: anomalies || 0, blocked: blocked || 0 }
    const aiSummary = await summariseWithGemini(facts, drive.title)
    const summary = aiSummary ??
      `${drive.title} processed ${facts.applications} applications; ${facts.eligible} were eligible, ${facts.shortlisted} shortlisted, with ${facts.proposals} proposals, ${facts.anomalies} anomalies, and ${facts.blocked} blocked actions.`
    return Response.json({ summary, facts, generatedBy: aiSummary ? 'gemini' : 'deterministic-fallback' }, { headers: cors })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Request failed.' }, { status: 400, headers: cors }) }
})
