import { supabase } from '../lib/supabase'

const req = () => { if (!supabase) throw new Error('Supabase is not configured.') }

export async function getAllProfiles() {
  req()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, is_active, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function updateProfileStatus(profileId, isActive) {
  req()
  const { error } = await supabase.rpc('set_profile_active', {
    p_profile_id: profileId,
    p_is_active: isActive,
  })
  if (error) throw error
}

export async function getMyAccessRequests(adminId) {
  req()
  const { data, error } = await supabase
    .from('admin_access_requests')
    .select('id, resource_type, resource_id, reason, status, created_at, accessed_at')
    .eq('admin_id', adminId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createAccessRequest({ resourceType, resourceId, reason }) {
  req()
  const { data, error } = await supabase.rpc('create_admin_access_request', {
    p_resource_type: resourceType,
    p_resource_id: resourceId || null,
    p_reason: reason,
  })
  if (error) throw error
  return data
}
