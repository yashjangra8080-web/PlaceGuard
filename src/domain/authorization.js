export const ROLES = ['student', 'company', 'coordinator', 'tnp_head', 'admin']
export function can(role, action, context = {}) {
  const { ownerId, actorId, proposalCreatorId } = context
  if (!ROLES.includes(role)) return false
  if (action === 'read:open_drive') return true
  if (action === 'create:application') return role === 'student'
  if (action === 'manage:drive') return role === 'company' && ownerId === actorId
  if (action === 'create:proposal') return role === 'coordinator'
  if (action === 'approve:proposal') return role === 'tnp_head' && proposalCreatorId !== actorId
  if (action === 'lock:shortlist') return role === 'tnp_head'
  if (action === 'write:audit') return false
  if (action === 'read:private_student') return ['coordinator', 'tnp_head', 'admin'].includes(role)
  return false
}
