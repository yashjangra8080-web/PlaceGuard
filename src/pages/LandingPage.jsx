import { Link } from 'react-router-dom'
import { LogoMark } from '../components/brand/Logo'

// ── Static product mockup for hero ───────────────────────────────────────────
function ProductMockup() {
  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 16,
      padding: '1px',
      boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
      flexShrink: 0,
      width: '100%',
      maxWidth: 480,
    }}>
      {/* Mockup top bar */}
      <div style={{ background: '#1e293b', borderRadius: '15px 15px 0 0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#d97706' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669' }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>placeguard.app/company</span>
      </div>
      {/* Mockup content */}
      <div style={{ padding: '20px', background: '#0f172a', borderRadius: '0 0 15px 15px' }}>
        {/* Mini KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
          {[['247', 'Applications', '#4f46e5'],['68', 'In Assessment', '#d97706'],['31', 'Shortlisted', '#059669']].map(([val, label, color]) => (
            <div key={label} style={{ background: '#1e293b', borderRadius: 10, padding: '12px 14px', borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: -1, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Funnel */}
        <div style={{ background: '#1e293b', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12 }}>Recruitment Funnel</div>
          {[
            ['Applications', 247, '#4f46e5', 100],
            ['Aptitude Passed', 142, '#0284c7', 57],
            ['Technical Round', 68, '#d97706', 27],
            ['Shortlisted', 31, '#059669', 12],
          ].map(([label, count, color, pct]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 88, fontSize: 10, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>{label}</div>
              <div style={{ flex: 1, height: 16, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'white' }}>{count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Active assessment */}
        <div style={{ background: '#1e293b', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>Frontend Developer — Round 1</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '2px 7px', borderRadius: 10 }}>LIVE</div>
          </div>
          {[
            ['Rahul S.', '14/20', '#059669', 72],
            ['Priya M.', '11/20', '#d97706', 55],
            ['Alice K.', 'In Progress', '#4f46e5', 40],
          ].map(([name, score, color]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: color + '22', border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color, flexShrink: 0 }}>{name[0]}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', flex: 1 }}>{name}</div>
              <div style={{ fontSize: 10, color: '#f1f5f9', fontWeight: 700 }}>{score}</div>
            </div>
          ))}
        </div>

        {/* Audit badge */}
        <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>✓</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399' }}>Audit Integrity · Verified</div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>127 / 127 commits valid · SHA-256 chain</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Process step ─────────────────────────────────────────────────────────────
function ProcessStep({ icon, title, sub, last }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: '#1e3a5f',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, marginBottom: 10, border: '1px solid #2d4d7f', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', textAlign: 'center', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>{sub}</div>
      {!last && (
        <div style={{ position: 'absolute', top: 26, left: '75%', right: '-25%', height: 1, background: 'linear-gradient(90deg, #2d4d7f, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', zIndex: 0 }}>
          <span style={{ color: '#4f46e5', fontSize: 14, marginRight: -4 }}>›</span>
        </div>
      )}
    </div>
  )
}

// ── Feature row ──────────────────────────────────────────────────────────────
function FeatureRow({ icon, title, sub, reverse }) {
  return (
    <div style={{ display: 'flex', gap: 48, alignItems: 'center', flexDirection: reverse ? 'row-reverse' : 'row', flexWrap: 'wrap', padding: '40px 0', borderBottom: '1px solid #1e3a5f' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>{icon}</div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 10, letterSpacing: -0.4 }}>{title}</h3>
        <p style={{ fontSize: 14.5, color: '#64748b', lineHeight: 1.7 }}>{sub}</p>
      </div>
      <div style={{ flex: 1, minWidth: 240, background: '#1e293b', borderRadius: 16, padding: '24px 28px', border: '1px solid #1e3a5f' }}>
        {icon === '🎯' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['min_cgpa ≥ 7.5', '✓ Enforced server-side', '#059669'],['max_backlogs ≤ 0', '✓ Enforced server-side', '#059669'],['branch IN (CSE, IT)', '✓ Enforced server-side', '#059669'],['deadline PASSED', '✗ Application blocked', '#dc2626']].map(([rule, status, color]) => (
              <div key={rule} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#0f172a', borderRadius: 8, fontSize: 12 }}>
                <code style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{rule}</code>
                <span style={{ color, fontWeight: 700, fontSize: 11 }}>{status}</span>
              </div>
            ))}
          </div>
        )}
        {icon === '✨' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12 }}>✨ AI Draft — Requires Human Review</div>
            {['Which React hook is used for side effects?','What is the time complexity of binary search?','Explain event bubbling in JavaScript.'].map((q, i) => (
              <div key={i} style={{ padding: '10px 14px', background: '#0f172a', borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: '#94a3b8', flex: 1 }}>{q}</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '2px 6px', borderRadius: 5 }}>✓</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 5 }}>✗</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {icon === '🔒' && (
          <div>
            {[['Admin', 'REQUEST', 'Modify eligibility criteria', '#d97706'],['T&P Head', 'REVIEW', 'Verify and approve change', '#4f46e5'],['System', 'COMMIT', 'Audit event recorded', '#059669']].map(([role, action, reason, color]) => (
              <div key={role} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8, border: `1px solid ${color}22` }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{role} · {action}</div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <main style={{ background: '#0a1628', minHeight: '100vh', fontFamily: "Inter, system-ui, sans-serif", color: '#f1f5f9' }}>
      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 64, borderBottom: '1px solid #1e293b',
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,22,40,0.92)', backdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={28} />
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.5, color: '#f1f5f9' }}>PlaceGuard</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="#how" style={{ fontSize: 13.5, color: '#94a3b8', textDecoration: 'none', fontWeight: 500 }}>How it works</a>
          <a href="#why" style={{ fontSize: 13.5, color: '#94a3b8', textDecoration: 'none', fontWeight: 500 }}>Features</a>
          <Link to="/login" style={{
            background: '#4f46e5', color: 'white', borderRadius: 8,
            padding: '8px 18px', fontSize: 13.5, fontWeight: 600,
            textDecoration: 'none', transition: 'background 0.15s',
          }}>Sign in</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '80px 40px 80px', maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 60, flexWrap: 'wrap' }}>
        {/* Left */}
        <div style={{ flex: '1', minWidth: 320 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1e293b', border: '1px solid #2d4d7f', borderRadius: 20, padding: '5px 14px', marginBottom: 24 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pg-pulse 2s infinite' }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8' }}>Trusted Placement Governance Platform</span>
          </div>

          <h1 style={{ fontSize: 'clamp(32px, 5vw, 54px)', fontWeight: 800, lineHeight: 1.12, letterSpacing: -1.5, marginBottom: 20, color: '#f8fafc' }}>
            Every Placement<br />
            Decision. <span style={{ color: '#818cf8' }}>Verified,<br />
            Evaluated, Audited.</span>
          </h1>

          <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.7, marginBottom: 32, maxWidth: 480 }}>
            A deterministic, auditable recruitment platform where companies define real assessment pipelines, students take actual tests, and T&P governance is cryptographically verifiable.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/login" style={{
              background: '#4f46e5', color: 'white', borderRadius: 10,
              padding: '13px 28px', fontSize: 15, fontWeight: 700,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 24px rgba(79,70,229,0.4)',
              transition: 'all 0.15s',
            }}>
              Access PlaceGuard →
            </Link>
            <a href="#how" style={{
              background: 'transparent', color: '#94a3b8', borderRadius: 10,
              padding: '13px 24px', fontSize: 15, fontWeight: 600,
              textDecoration: 'none', border: '1px solid #1e293b',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              See how it works ↓
            </a>
          </div>

          {/* Trust indicators */}
          <div style={{ display: 'flex', gap: 20, marginTop: 36, flexWrap: 'wrap' }}>
            {['Server-side eligibility', 'Real-time assessments', 'Audit trail'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#34d399', fontSize: 13 }}>✓</span>
                <span style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — product mockup */}
        <ProductMockup />
      </section>

      {/* ── Trust strip ── */}
      <section style={{ borderTop: '1px solid #1e293b', borderBottom: '1px solid #1e293b', padding: '24px 40px', background: '#0d1f35' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 20 }}>
          {[
            ['✨', 'AI-Powered Assessments'],
            ['🎯', 'Deterministic Eligibility'],
            ['🔍', 'Auditable Every Decision'],
            ['🏢', 'Company-Specific Rounds'],
            ['🛡️', 'T&P Governance Layer'],
          ].map(([icon, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ padding: '80px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>THE FULL WORKFLOW</div>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, color: '#f8fafc', marginBottom: 12 }}>How PlaceGuard works</h2>
          <p style={{ fontSize: 15, color: '#64748b', maxWidth: 540, margin: '0 auto' }}>
            From company configuration to final selection — every step is governed, evaluated, and recorded.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            ['🏢', 'Company Setup', 'Define role, eligibility & rounds'],
            ['✨', 'AI Assessment', 'Generate & review test questions'],
            ['📝', 'Candidate Tests', 'Real-time assessments with timer'],
            ['⚡', 'Auto Scoring', 'Server-side instant evaluation'],
            ['📊', 'AI Analysis', 'Gemini recruitment insights'],
            ['🛡️', 'T&P Review', 'Governance-controlled decisions'],
            ['🎓', 'Final Selection', 'Auditable, tamper-evident record'],
          ].map(([icon, title, sub], i, arr) => (
            <ProcessStep key={title} icon={icon} title={title} sub={sub} last={i === arr.length - 1} />
          ))}
        </div>
      </section>

      {/* ── Why PlaceGuard ── */}
      <section id="why" style={{ padding: '40px 40px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>KEY CAPABILITIES</div>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, color: '#f8fafc', marginBottom: 12 }}>Built for real placement operations</h2>
        </div>

        <FeatureRow
          icon="🎯"
          title="Deterministic eligibility. Never AI-decided."
          sub="Eligibility rules are evaluated in PostgreSQL — not in the browser, not by an LLM. CGPA, backlogs, branch, skills, deadlines: all enforced server-side with zero trust given to the frontend."
        />
        <FeatureRow
          icon="✨"
          title="AI-generated assessments with human review."
          sub="Gemini generates draft questions organized by topic and difficulty. Every draft requires explicit human approval before entering any assessment. AI is advisory — a human commits every question."
          reverse
        />
        <FeatureRow
          icon="🔒"
          title="Separation of duties. Governance built-in."
          sub="Admin requests sensitive changes. T&P Head independently approves or rejects. Every decision is committed to an append-only audit trail. No single actor can bypass the governance layer."
        />
      </section>

      {/* ── Final CTA ── */}
      <section style={{ background: '#0d1f35', borderTop: '1px solid #1e293b', padding: '80px 40px', textAlign: 'center' }}>
        <div style={{ maxWidth: 580, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>GET STARTED</div>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, color: '#f8fafc', marginBottom: 16 }}>
            Ready to modernize your placement process?
          </h2>
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 32 }}>
            Log in with your institution credentials and experience the platform firsthand.
          </p>
          <Link to="/login" style={{
            background: '#4f46e5', color: 'white', borderRadius: 12,
            padding: '15px 36px', fontSize: 16, fontWeight: 700,
            textDecoration: 'none', display: 'inline-block',
            boxShadow: '0 4px 24px rgba(79,70,229,0.5)',
          }}>
            Access PlaceGuard →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #1e293b', padding: '24px 40px', textAlign: 'center' }}>
        <p style={{ fontSize: 12.5, color: '#475569' }}>
          © 2026 PlaceGuard · Append-only, tamper-evident audit trail · Built for campus placement governance
        </p>
      </footer>

      <style>{`
        @keyframes pg-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 768px) {
          nav { padding: 0 20px !important; }
          section { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>
    </main>
  )
}
