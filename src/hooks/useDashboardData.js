import { useEffect, useState } from 'react'
import { getDashboardData } from '../services/placement'
import { isSupabaseConfigured } from '../lib/supabase'
export function useDashboardData(profile) { const [state, setState] = useState({ loading: isSupabaseConfigured, error: null, data: null }); useEffect(() => { let live = true; if (!isSupabaseConfigured) { setState({ loading: false, error: 'Supabase is not configured for this deployment.', data: null }); return () => { live = false } } ; getDashboardData(profile).then((data) => live && setState({ loading: false, error: null, data })).catch(() => live && setState({ loading: false, error: 'Live dashboard data could not be loaded. Please retry.', data: null })); return () => { live = false } }, [profile]); return state }
