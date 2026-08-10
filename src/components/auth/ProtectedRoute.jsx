import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
export default function ProtectedRoute({ roles, children }) {
  const { loading, session, profile } = useAuth()
  if (loading) return <div className="page-state">Restoring your secure session…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!profile || !profile.is_active) return <div className="page-state"><h1>Account configuration required</h1><p>Your authenticated account has no active, authorized PlaceGuard profile. Contact the placement office.</p></div>
  if (!roles.includes(profile.role)) return <Navigate to={`/${profile.role === 'tnp_head' ? 'tnp' : profile.role}`} replace />
  return children
}
