import { supabase } from '../lib/supabase'

const req = () => { if (!supabase) throw new Error('Supabase is not configured.') }

// ── Open drives (students can read status=open) ──────────────────────────────

export async function getOpenDrives() {
  req()
  const { data, error } = await supabase
    .from('drives')
    .select('id, title, description, role_name, deadline, status, companies(company_name), eligibility_rules(min_cgpa, max_backlogs, allowed_branches, required_skills), drive_rounds(round_number, name, round_type)')
    .eq('status', 'open')
    .order('deadline', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getGovernanceDrives() {
  req()
  const { data, error } = await supabase
    .from('drives')
    .select('id, title, role_name, deadline, status, companies(company_name)')
    .in('status', ['open', 'closed'])
    .order('deadline', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ── Student profile / applications ───────────────────────────────────────────

export async function getStudentRecord(profileId) {
  req()
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getStudentApplications(studentId) {
  req()
  const { data, error } = await supabase
    .from('applications')
    .select('id, drive_id, status, applied_at, drives(title, role_name, deadline, companies(company_name)), eligibility_results(eligible, failed_rules, checked_at)')
    .eq('student_id', studentId)
    .order('applied_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── Company profile / drives ─────────────────────────────────────────────────

export async function getCompanyRecord(profileId) {
  req()
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getCompanyDrives(companyId) {
  req()
  const { data, error } = await supabase
    .from('drives')
    .select('id, title, role_name, deadline, status, eligibility_rules(min_cgpa, max_backlogs, allowed_branches)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getDriveDetail(driveId) {
  req()
  const { data, error } = await supabase
    .from('drives')
    .select('*, eligibility_rules(*), companies(company_name)')
    .eq('id', driveId)
    .single()
  if (error) throw error
  return data
}

export async function getDriveApplicantCounts(driveId) {
  req()
  const [all, eligible, shortlisted] = await Promise.all([
    supabase.from('applications').select('*', { count: 'exact', head: true }).eq('drive_id', driveId),
    supabase.from('applications').select('*', { count: 'exact', head: true }).eq('drive_id', driveId).eq('status', 'ELIGIBLE'),
    supabase.from('shortlists').select('*', { count: 'exact', head: true }).eq('drive_id', driveId).eq('status', 'SHORTLISTED'),
  ])
  if (all.error) throw all.error
  if (eligible.error) throw eligible.error
  if (shortlisted.error) throw shortlisted.error
  return { total: all.count ?? 0, eligible: eligible.count ?? 0, shortlisted: shortlisted.count ?? 0 }
}

export async function getDriveApplications(driveId) {
  req()
  const { data, error } = await supabase
    .from('applications')
    .select('id, student_id, status, applied_at, eligibility_results(eligible, failed_rules)')
    .eq('drive_id', driveId)
    .order('applied_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getDriveAuditTrail(driveId) {
  req()
  const { data, error } = await supabase
    .from('audit_commits')
    .select('id, sequence_number, action_type, reason, status, created_at')
    .eq('entity_id', driveId)
    .order('sequence_number', { ascending: false })
    .limit(15)
  if (error) throw error
  return data ?? []
}

// ── Drive write operations (company) ─────────────────────────────────────────

export async function createDriveWithRules({ title, description, roleName, deadline, minCgpa, allowedBranches, maxBacklogs, requiredSkills }) {
  req()
  const { data, error } = await supabase.rpc('create_drive_with_rules', {
    p_title: title,
    p_description: description,
    p_role_name: roleName,
    p_deadline: deadline,
    p_min_cgpa: minCgpa,
    p_allowed_branches: allowedBranches,
    p_max_backlogs: maxBacklogs,
    p_required_skills: requiredSkills,
  })
  if (error) throw error
  return data
}

export async function publishDrive(driveId) {
  req()
  const { error } = await supabase.rpc('publish_drive', { p_drive: driveId })
  if (error) throw error
}

export async function lockShortlist(driveId) {
  req()
  const { error } = await supabase.rpc('lock_shortlist', { p_drive: driveId })
  if (error) throw error
}

// ── Coordinator: candidate pool + proposals ───────────────────────────────────

export async function getDrivesWithEligibleCandidates() {
  req()
  const { data: drives, error: drivesError } = await supabase
    .from('drives')
    .select('id, title, role_name, deadline, status, companies(company_name)')
    .eq('status', 'open')
    .order('deadline', { ascending: true })
  if (drivesError) throw drivesError
  if (!drives || drives.length === 0) return { drives: [], applications: [] }

  const { data: applications, error: appError } = await supabase
    .from('applications')
    .select('id, drive_id, student_id, status, applied_at, students(id, roll_number, branch, cgpa, backlogs, profiles(name)), eligibility_results(eligible, failed_rules)')
    .in('drive_id', drives.map((d) => d.id))
    .order('applied_at', { ascending: false })
  if (appError) throw appError

  return { drives: drives ?? [], applications: applications ?? [] }
}

export async function getMyProposals(profileId) {
  req()
  const { data, error } = await supabase
    .from('shortlist_proposals')
    .select('id, drive_id, student_id, action, reason, status, created_at, drives(title, deadline), students(roll_number, branch, cgpa, profiles(name))')
    .eq('proposed_by', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── TnP Head: approvals + integrity ──────────────────────────────────────────

export async function getPendingProposals() {
  req()
  const { data, error } = await supabase
    .from('shortlist_proposals')
    .select('id, drive_id, student_id, proposed_by, action, reason, status, created_at, drives(title, deadline, companies(company_name)), students(roll_number, branch, cgpa, profiles(name))')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getAnomalyAlerts() {
  req()
  const { data, error } = await supabase
    .from('anomaly_alerts')
    .select('id, type, severity, description, risk_score, status, created_at, drives(title)')
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}
