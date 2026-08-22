import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LogoWordmark from '../components/brand/Logo'

const TRUST_ITEMS = [
  'Server-side eligibility — never browser-decided',
  'Role-based access with RLS enforcement',
  'Cryptographic audit trail on every decision',
  'AI-powered assessments with human review',
]

export default function LoginPage() {
  const { signIn, session, loading, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Incorrect email or password. Please try again.'
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      {/* ── Left branding panel ── */}
      <div className="auth-left">
        {/* Logo */}
        <div>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            <LogoWordmark size="md" />
          </Link>
        </div>

        {/* Hero copy */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
            Trusted by placement offices
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f0f4f8', letterSpacing: -1, lineHeight: 1.2, marginBottom: 16 }}>
            Every decision.<br />
            <span style={{ color: '#818cf8' }}>Verified &amp; Audited.</span>
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, marginBottom: 32 }}>
            A deterministic placement governance platform where
            companies run real assessments, students take actual
            tests, and every decision is cryptographically recorded.
          </p>

          {/* Trust list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TRUST_ITEMS.map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6,
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, flexShrink: 0, color: '#10b981',
                }}>✓</div>
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <div style={{
          padding: '16px 20px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
        }}>
          <p style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 }}>
            "Placement governance that your students and companies can actually trust."
          </p>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>PlaceGuard Platform</div>
        </div>
      </div>

      {/* ── Right: login form ── */}
      <div className="auth-right">
        <div className="auth-card">
          {/* Card header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>
              Secure access
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f0f4f8', letterSpacing: -0.5, marginBottom: 6 }}>
              Sign in to PlaceGuard
            </h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Use the account provisioned by your placement office or company administrator.
            </p>
          </div>

          {!isConfigured ? (
            <div className="alert warning">
              This deployment needs Supabase configuration. Add the public values described in <code>.env.example</code>.
            </div>
          ) : (
            <form onSubmit={submit}>
              {/* Email */}
              <div style={{ marginBottom: 18 }}>
                <label style={{
                  display: 'block', fontSize: 11.5, fontWeight: 700,
                  color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
                }}>
                  Email address
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 15, color: '#475569',
                  }}>✉</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@institution.edu"
                    style={{
                      width: '100%', paddingLeft: 38, paddingRight: 14,
                      paddingTop: 11, paddingBottom: 11,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, fontSize: 14,
                      color: '#f0f4f8', outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                    onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block', fontSize: 11.5, fontWeight: 700,
                  color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
                }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 14, color: '#475569',
                  }}>🔒</span>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Your secure password"
                    style={{
                      width: '100%', paddingLeft: 38, paddingRight: 44,
                      paddingTop: 11, paddingBottom: 11,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, fontSize: 14,
                      color: '#f0f4f8', outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                    onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#475569', fontSize: 13, padding: 4,
                    }}
                  >
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)',
                  borderRadius: 9, padding: '11px 14px', marginBottom: 20,
                  fontSize: 13, color: '#fda4af', display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <span style={{ flexShrink: 0 }}>⚠</span> {error}
                </div>
              )}

              {/* Submit */}
              <button
                className="primary-button"
                type="submit"
                disabled={busy}
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: 14, fontWeight: 700 }}
              >
                {busy ? (
                  <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
                ) : 'Sign in securely →'}
              </button>

              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 20 }}>
                Access is provisioned by your placement office or administrator.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
