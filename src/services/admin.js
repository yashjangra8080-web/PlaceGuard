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
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', profileId)
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

export async function createAccessRequest(adminId, { resourceType, resourceId, reason }) {
  req()
  const { data, error } = await supabase
    .from('admin_access_requests')
    .insert({ admin_id: adminId, resource_type: resourceType, resource_id: resourceId || null, reason })
    .select()
    .single()
  if (error) throw error
  return data
}
