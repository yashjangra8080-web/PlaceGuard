export function ensureBeforeDeadline(deadline, now = new Date()) {
  const deadlineAt = new Date(deadline)
  return Number.isFinite(deadlineAt.getTime()) && now.getTime() <= deadlineAt.getTime()
}
export function proposalDecision({ proposal, reviewerId, reviewerRole, now = new Date() }) {
  if (reviewerRole !== 'tnp_head') return { allowed: false, reason: 'Only the T&P Head can review proposals.' }
  if (proposal.proposed_by === reviewerId) return { allowed: false, reason: 'Proposal creators cannot approve their own proposals.' }
  if (!ensureBeforeDeadline(proposal.deadline, now)) return { allowed: false, reason: 'Drive deadline has passed.' }
  return { allowed: true }
}
