import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const loadProfile = useCallback(async (user) => {
    if (!user || !supabase) { setProfile(null); return }
    const { data, error: profileError } = await supabase.from('profiles').select('id,name,email,role,is_active').eq('id', user.id).maybeSingle()
    if (profileError) throw profileError
    setProfile(data || null)
  }, [])
  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined }
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (sessionError) setError('Unable to restore your session.')
      setSession(data.session)
      try { await loadProfile(data.session?.user) } catch { setError('Your account profile could not be loaded.') }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      try { await loadProfile(nextSession?.user) } catch { setError('Your account profile could not be loaded.') }
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [loadProfile])
  const signIn = async (email, password) => {
    if (!supabase) throw new Error('Supabase is not configured for this deployment.')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
  }
  const signOut = () => supabase?.auth.signOut()
  const value = useMemo(() => ({ session, profile, loading, error, isConfigured: isSupabaseConfigured, signIn, signOut }), [session, profile, loading, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
