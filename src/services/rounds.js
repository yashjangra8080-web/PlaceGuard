import { supabase } from '../lib/supabase'

const req = () => { if (!supabase) throw new Error('Supabase is not configured.') }

// ── Add a round to a draft drive (company) ────────────────────────────────────
export async function addDriveRound({ driveId, roundNumber, name, roundType, description, isElimination, passingScore, maxScore, scheduledAt }) {
  req()
  const { data, error } = await supabase.rpc('add_drive_round', {
    p_drive: driveId,
    p_round_number: roundNumber,
    p_name: name,
    p_round_type: roundType,
    p_description: description ?? '',
    p_is_elimination: isElimination ?? true,
    p_passing_score: passingScore ?? null,
    p_max_score: maxScore ?? null,
    p_scheduled_at: scheduledAt ?? null,
  })
  if (error) throw error
  return data
}

// ── Evaluate a student's round result (company / staff) ───────────────────────
export async function evaluateRound({ applicationRoundId, status, score, feedback }) {
  req()
  const { data, error } = await supabase.rpc('evaluate_round', {
    p_application_round_id: applicationRoundId,
    p_status: status,
    p_score: score ?? null,
    p_feedback: feedback ?? null,
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.message ?? 'Evaluation failed.')
  return data
}

// ── Get a student's own round progress for one application ────────────────────
export async function getMyApplicationRounds(applicationId) {
  req()
  const { data, error } = await supabase.rpc('get_my_application_rounds', {
    p_application: applicationId,
  })
  if (error) throw error
  return data ?? []
}

// ── Get all applicants + round status for a drive (company / staff) ───────────
export async function getDriveApplicants(driveId) {
  req()
  const { data, error } = await supabase.rpc('get_drive_applicants', {
    p_drive: driveId,
  })
  if (error) throw error
  return data ?? []
}

// ── Get rounds configured for a drive (readable without auth for open drives) ─
export async function getDriveRounds(driveId) {
  req()
  const { data, error } = await supabase
    .from('drive_rounds')
    .select('id,round_number,name,round_type,description,is_elimination,passing_score,max_score,scheduled_at,status')
    .eq('drive_id', driveId)
    .order('round_number', { ascending: true })
  if (error) throw error
  return data ?? []
}
