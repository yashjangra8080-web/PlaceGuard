import { supabase } from '../lib/supabase'
const requireClient = () => { if (!supabase) throw new Error('Supabase is not configured.') }
export async function getDashboardData(profile) {
  requireClient()
  const role = profile.role
  const [notifications, integrity] = await Promise.all([supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('recipient_id', profile.id), role === 'company' || role === 'tnp_head' ? supabase.rpc('verify_audit_chain') : Promise.resolve({ data: null })])
  if (notifications.error) throw notifications.error
  const metrics = []
  if (role === 'student') { const studentRec = await supabase.from('students').select('id').eq('profile_id', profile.id).maybeSingle(); const studentId = studentRec.data?.id; const { count, error } = studentId ? await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('student_id', studentId) : { count: 0, error: null }; if (error) throw error; metrics.push(['Applications', count || 0], ['Notifications', notifications.count || 0]) }
  if (role === 'company') { const { data: company, error } = await supabase.from('companies').select('id').eq('profile_id', profile.id).single(); if (error) throw error; const { count, error: drivesError } = await supabase.from('drives').select('*', { count: 'exact', head: true }).eq('company_id', company.id); if (drivesError) throw drivesError; metrics.push(['Company drives', count || 0], ['Notifications', notifications.count || 0], ['Audit commits checked', integrity.data?.checked ?? 0]) }
  if (role === 'coordinator' || role === 'tnp_head') { const { count, error } = await supabase.from('shortlist_proposals').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'); if (error) throw error; metrics.push(['Pending proposals', count || 0], ['Notifications', notifications.count || 0]) }
  if (role === 'admin') { const { count, error } = await supabase.from('admin_access_requests').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'); if (error) throw error; metrics.push(['Pending access requests', count || 0], ['Notifications', notifications.count || 0]) }
  const { data: activity, error: activityError } = await supabase.from('audit_commits').select('id,action_type,reason,status,created_at').order('sequence_number', { ascending: false }).limit(5)
  if (activityError) throw activityError
  return { metrics, activity, integrity: integrity.data }
}
export async function applyToDrive(driveId) {
  requireClient()
  // apply_to_drive_result returns {ok, applicationId, message} as jsonb
  // It records blocked attempts without rolling back the audit event
  const { data, error } = await supabase.rpc('apply_to_drive_result', { p_drive: driveId })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.message || 'Your application could not be submitted.')
  return data.applicationId
}
export async function proposeShortlistChange(driveId, studentId, action, reason) { requireClient(); const { data, error } = await supabase.rpc('create_shortlist_proposal', { p_drive: driveId, p_student: studentId, p_action: action, p_reason: reason }); if (error) throw error; return data }
export async function reviewProposal(proposalId, decision, reason) { requireClient(); const { error } = await supabase.rpc('review_proposal', { p_proposal: proposalId, p_decision: decision, p_reason: reason }); if (error) throw error }
export async function verifyAuditIntegrity() { requireClient(); const { data, error } = await supabase.rpc('verify_audit_chain'); if (error) throw error; return data }
