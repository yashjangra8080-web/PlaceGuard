import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
export default function LoginPage() {
  const { signIn, session, loading, isConfigured } = useAuth(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  if (!loading && session) return <Navigate to="/" replace />
  const submit = async (event) => { event.preventDefault(); setError(''); setBusy(true); try { await signIn(email, password) } catch (err) { setError(err.message === 'Invalid login credentials' ? 'Incorrect email or password.' : err.message) } finally { setBusy(false) } }
  return <main className="auth-page"><Link className="brand dark" to="/">PLACE<span>GUARD</span></Link><section className="auth-card"><span className="eyebrow">SECURE SIGN IN</span><h1>Verify your access</h1><p>Use the account provisioned by your placement office or company administrator.</p>{!isConfigured ? <div className="alert warning">This deployment needs Supabase configuration. Add the public values described in <code>.env.example</code>.</div> : <form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>{error && <div className="alert error">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button></form>}</section></main>
}
