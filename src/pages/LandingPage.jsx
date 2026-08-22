import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from '../components/brand/Logo'
import {
  Menu, X, ArrowRight, ArrowDown, CheckCircle2, ShieldCheck, Target, Sparkles,
  Lock, Eye, Building2, GraduationCap,
  ClipboardList, FileCheck, Gauge, Award, ListChecks, ScrollText,
  Layers, AlertTriangle, TrendingDown, EyeOff, GitBranch,
} from 'lucide-react'

// ── Nav ─────────────────────────────────────────────────────────────────────
function NavBar({ navOpen, setNavOpen }) {
  const links = [
    { href: '#how', label: 'How it Works' },
    { href: '#why', label: 'Features' },
    { href: '#students', label: 'For Students' },
    { href: '#companies', label: 'For Companies' },
    { href: '#governance', label: 'Governance' },
  ]
  return (
    <nav className="lp-nav">
      <div className="lp-nav-brand">
        <LogoMark size={28} />
        <span>PlaceGuard</span>
      </div>

      <div className="lp-nav-links">
        {links.map(l => (
          <a key={l.href} href={l.href} className="lp-nav-link">{l.label}</a>
        ))}
      </div>

      <div className="lp-nav-actions">
        <Link to="/login" className="btn-secondary lp-signin-btn">
          Sign in
        </Link>
        <Link to="/login" className="btn-primary">
          <span className="lp-cta-long">Access PlaceGuard</span>
          <ArrowRight size={15} />
        </Link>
        <button
          type="button"
          className="lp-nav-toggle"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen(o => !o)}
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <div className={`lp-nav-drawer${navOpen ? ' open' : ''}`}>
        {links.map(l => (
          <a key={l.href} href={l.href} onClick={() => setNavOpen(false)}>{l.label}</a>
        ))}
        <a href="/login" onClick={() => setNavOpen(false)}>Sign in</a>
      </div>
    </nav>
  )
}

// ── Hero product mockup ─────────────────────────────────────────────────────
// Reads as a real product screenshot — three panels: KPIs, funnel, candidate rounds
function ProductMockup() {
  const kpis = [
    { val: '247', label: 'Applications', color: 'var(--accent-mid)' },
    { val: '68',  label: 'In Assessment', color: 'var(--info)' },
    { val: '31',  label: 'Shortlisted', color: 'var(--success)' },
  ]
  const funnel = [
    { label: 'Applications',   count: 247, pct: 100, color: 'var(--accent-mid)' },
    { label: 'Aptitude Passed', count: 142, pct: 57,  color: 'var(--info)' },
    { label: 'Technical Round', count: 68,  pct: 27,  color: 'var(--warning)' },
    { label: 'Shortlisted',    count: 31,  pct: 12,  color: 'var(--success)' },
  ]
  const roundRows = [
    { name: 'Round 1 - Aptitude', status: 'Passed',      badge: 'badge-green' },
    { name: 'Round 2 - Technical', status: 'In Progress', badge: 'badge-indigo' },
    { name: 'Round 3 - Interview', status: 'Locked',      badge: 'badge-slate' },
  ]

  return (
    <div className="lp-mockup" role="img" aria-label="Preview of a PlaceGuard company recruitment dashboard">
      {/* macOS-style titlebar */}
      <div className="lp-mockup-bar">
        <div className="lp-mockup-dot" style={{ background: '#dc2626' }} />
        <div className="lp-mockup-dot" style={{ background: '#d97706' }} />
        <div className="lp-mockup-dot" style={{ background: '#059669' }} />
        <span className="lp-mockup-url">placeguard.app/company/drives</span>
      </div>

      <div className="lp-mockup-body">
        {/* KPI row */}
        <div className="lp-mockup-kpis">
          {kpis.map(({ val, label, color }) => (
            <div key={label} className="lp-mockup-kpi" style={{ borderTopColor: color }}>
              <div className="lp-mockup-kpi-val">{val}</div>
              <div className="lp-mockup-kpi-label">{label}</div>
            </div>
          ))}
        </div>

        {/* Recruitment funnel */}
        <div className="lp-mockup-panel">
          <div className="lp-mockup-panel-label">Recruitment Funnel</div>
          {funnel.map(({ label, count, pct, color }) => (
            <div key={label} className="lp-funnel-row">
              <div className="lp-funnel-label">{label}</div>
              <div className="lp-funnel-track">
                <div className="lp-funnel-fill" style={{ width: `${pct}%`, background: color }}>
                  <span>{count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Candidate rounds (student-view preview) */}
        <div className="lp-mockup-panel">
          <div className="lp-mockup-live-row">
            <div className="lp-mockup-live-title">Frontend Dev - Round Progress</div>
            <div className="lp-live-badge">LIVE</div>
          </div>
          {roundRows.map(({ name, status, badge }) => (
            <div key={name} className="lp-rule-row" style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{name}</span>
              <span className={`badge ${badge}`}>{status}</span>
            </div>
          ))}
        </div>

        {/* Audit integrity strip */}
        <div className="lp-audit-strip">
          <div className="lp-audit-icon"><ShieldCheck size={15} /></div>
          <div>
            <div className="lp-audit-title">Audit Integrity - Verified</div>
            <div className="lp-audit-sub">127 / 127 commits valid - SHA-256 chain</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="lp-hero lp-container">
      <div className="lp-hero-copy">
        <div className="lp-badge">
          <span className="lp-badge-dot" />
          <span>Trusted Placement Governance Platform</span>
        </div>

        <h1 className="lp-h1">
          Every placement decision.<br />
          <em>Verified, evaluated, auditable.</em>
        </h1>

        <p className="lp-sub">
          PlaceGuard connects eligibility, applications, real assessments, AI-assisted
          analysis, candidate progression and institutional governance into one
          recruitment lifecycle - enforced server-side, not left to chance.
        </p>

        <div className="lp-cta-row">
          <Link to="/login" className="btn-primary">
            Explore PlaceGuard <ArrowRight size={15} />
          </Link>
          <a href="#how" className="btn-secondary">
            See how it works <ArrowDown size={14} />
          </a>
        </div>

        <div className="lp-audience-links">
          <a href="#students" className="lp-audience-link"><GraduationCap size={14} /> For Students</a>
          <a href="#companies" className="lp-audience-link"><Building2 size={14} /> For Companies</a>
        </div>

        <div className="lp-trust-row">
          {['Server-side eligibility', 'Real-time assessments', 'Append-only audit trail'].map(t => (
            <div key={t} className="lp-trust-item">
              <CheckCircle2 size={14} />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>

      <ProductMockup />
    </section>
  )
}

// ── Trust strip ──────────────────────────────────────────────────────────────
function TrustStrip() {
  const items = [
    [Sparkles, 'AI-Powered Assessments'],
    [Target, 'Deterministic Eligibility'],
    [Eye, 'Auditable Every Decision'],
    [Building2, 'Company-Specific Rounds'],
    [ShieldCheck, 'T&P Governance Layer'],
  ]
  return (
    <section className="lp-strip">
      <div className="lp-strip-inner">
        {items.map(([Icon, label]) => (
          <div key={label} className="lp-strip-item">
            {Icon && <Icon size={17} />}
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Why PlaceGuard ───────────────────────────────────────────────────────────
function WhySection() {
  const problems = [
    [AlertTriangle, 'Fragmented workflow', 'Spreadsheets, email threads and disconnected tools scattered across every recruitment cycle.'],
    [GitBranch, 'Disconnected assessments', 'Tests built and scored outside the system nobody can trace back to a candidate record.'],
    [EyeOff, 'Limited visibility', 'Coordinators and T&P staff find out where a drive stands only when someone asks.'],
    [TrendingDown, 'Weak analytics', 'No reliable signal on funnel drop-off, round performance, or where candidates struggle.'],
    [Lock, 'Governance gaps', 'Sensitive changes get made without a second reviewer or a durable record of who approved what.'],
  ]
  return (
    <section id="why" className="lp-section lp-container">
      <div className="lp-why-grid">
        <div>
          <div className="lp-eyebrow">KEY CAPABILITIES</div>
          <h2 className="lp-h2">Built for real placement operations</h2>
          <p className="lp-why-lede">
            Most placement cells run on <strong>fragmented tools</strong> that were never
            designed for the scale, scrutiny, or accountability that campus recruitment
            now demands.
          </p>
        </div>
        <div className="lp-why-list">
          {problems.map(([Icon, title, body]) => (
            <div key={title} className="lp-why-item">
              <div className="lp-why-icon">{Icon && <Icon size={16} />}</div>
              <div>
                <h4>{title}</h4>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── One connected lifecycle ──────────────────────────────────────────────────
function LifecycleSection() {
  const steps = [
    [ListChecks, 'Eligibility'],
    [ClipboardList, 'Application'],
    [FileCheck, 'Assessment'],
    [Gauge, 'Evaluation'],
    [Sparkles, 'AI Analysis'],
    [Layers, 'Round Progression'],
    [Award, 'Selection'],
    [ScrollText, 'Governance'],
  ]
  return (
    <section id="how" className="lp-section lp-section-alt">
      <div className="lp-container">
        <div className="lp-section-head">
          <div className="lp-eyebrow">THE FULL WORKFLOW</div>
          <h2 className="lp-h2">One connected recruitment lifecycle</h2>
          <p className="lp-h2-sub">
            From company configuration to final selection - every step is governed,
            evaluated and recorded in a single system of record.
          </p>
        </div>

        <div className="lp-chain">
          {steps.map(([Icon, label], i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div className="lp-chain-step">
                <div className="lp-chain-icon">{Icon && <Icon size={20} />}</div>
                <span>{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="lp-chain-arrow" aria-hidden="true"><ArrowRight size={16} /></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Audience block (Students / Companies / T&P) ─────────────────────────────
function AudienceBlock({ id, icon: Icon, kicker, title, body, bullets, visual, reverse }) {
  return (
    <div id={id} className={`lp-audience${reverse ? ' reverse' : ''}`}>
      <div className="lp-audience-copy">
        <div className="lp-audience-icon">{Icon && <Icon size={22} />}</div>
        <div className="lp-eyebrow">{kicker}</div>
        <h3>{title}</h3>
        <p>{body}</p>
        <ul className="lp-audience-bullets">
          {bullets.map(b => (
            <li key={b}><CheckCircle2 size={15} /><span>{b}</span></li>
          ))}
        </ul>
      </div>
      <div className="lp-audience-visual">{visual}</div>
    </div>
  )
}

function AudienceSection() {
  return (
    <section className="lp-section lp-container">
      <div className="lp-section-head">
        <div className="lp-eyebrow">BUILT FOR EVERY ROLE</div>
        <h2 className="lp-h2">One platform, three vantage points</h2>
        <p className="lp-h2-sub">Students, companies and institutional staff each get the view they need - on the same underlying record.</p>
      </div>

      <AudienceBlock
        id="students"
        icon={GraduationCap}
        kicker="FOR STUDENTS"
        title="Know exactly where you stand"
        body="Real assessments, round-by-round progression and immediate results - with AI-assisted feedback to help you prepare for what's next."
        bullets={['Real, timed assessments', 'Round-by-round progression tracking', 'Immediate, official results', 'AI-assisted preparation guidance']}
        visual={
          <div>
            {[
              ['Round 1 - Aptitude', 'Passed', 'badge-green'],
              ['Round 2 - Technical', 'In Progress', 'badge-indigo'],
              ['Round 3 - Interview', 'Locked', 'badge-slate'],
            ].map(([label, status, badge]) => (
              <div key={label} className="lp-rule-row" style={{ marginBottom: 10 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>{label}</span>
                <span className={`badge ${badge}`}>{status}</span>
              </div>
            ))}
          </div>
        }
      />

      <AudienceBlock
        id="companies"
        icon={Building2}
        kicker="FOR COMPANIES"
        title="Run a real recruitment pipeline"
        body="Configure eligibility, build assessments, and track candidates through every round - with AI assistance that stays advisory, never authoritative."
        bullets={['Custom drives & eligibility rules', 'AI-assisted assessment creation', 'Live candidate & round analytics', 'Full audit trail on every decision']}
        reverse
        visual={
          <div className="lp-mockup-kpis" style={{ marginBottom: 0 }}>
            {[['247', 'Applications'], ['68', 'Assessment'], ['31', 'Selected']].map(([v, l]) => (
              <div key={l} className="lp-mockup-kpi">
                <div className="lp-mockup-kpi-val">{v}</div>
                <div className="lp-mockup-kpi-label">{l}</div>
              </div>
            ))}
          </div>
        }
      />

      <AudienceBlock
        id="governance"
        icon={ShieldCheck}
        kicker="FOR T&P / ADMIN"
        title="Govern, don't just observe"
        body="Approvals, audit trails and role-based control give institutional staff real oversight - every sensitive change requires a second, independent reviewer."
        bullets={['Two-person approval on sensitive changes', 'Append-only, tamper-evident audit log', 'Role-based access across the institution', 'Full visibility into every active drive']}
        visual={
          <div>
            {[
              ['Admin', 'REQUEST', 'var(--warning)'],
              ['T&P Head', 'REVIEW', 'var(--accent-mid)'],
              ['System', 'COMMIT', 'var(--success)'],
            ].map(([role, action, color]) => (
              <div key={role} className="lp-audit-chain-row">
                <div className="lp-audit-chain-dot" style={{ background: color }} />
                <div>
                  <div className="lp-audit-chain-role" style={{ color }}>{role} - {action}</div>
                  <div className="lp-audit-chain-desc">Recorded to the append-only audit log</div>
                </div>
              </div>
            ))}
          </div>
        }
      />
    </section>
  )
}

// ── AI + Governance ───────────────────────────────────────────────────────────
function GovernanceBanner() {
  return (
    <div className="lp-gov-banner">
      <div className="lp-gov-cell">
        <div className="lp-gov-kicker">AI ASSISTS</div>
        <p>Gemini drafts questions and insights - it never decides an outcome.</p>
      </div>
      <div className="lp-gov-cell">
        <div className="lp-gov-kicker">BACKEND RULES ENFORCE</div>
        <p>Eligibility and scoring run in PostgreSQL, evaluated server-side every time.</p>
      </div>
      <div className="lp-gov-cell">
        <div className="lp-gov-kicker">AUTHORIZED HUMANS GOVERN</div>
        <p>Every sensitive change needs an independent, accountable approver.</p>
      </div>
    </div>
  )
}

function GovernanceFeatures() {
  return (
    <>
      <div className="lp-feature-row">
        <div className="lp-feature-copy">
          <div className="lp-feature-icon"><Target size={18} /></div>
          <h3>Deterministic eligibility. Never AI-decided.</h3>
          <p>Eligibility rules are evaluated in PostgreSQL - not in the browser, not by an LLM. CGPA, backlogs, branch, skills and deadlines are all enforced server-side, with zero trust given to the frontend.</p>
        </div>
        <div className="lp-feature-visual">
          {[
            ['min_cgpa >= 7.5', 'Enforced server-side', 'ok'],
            ['max_backlogs <= 0', 'Enforced server-side', 'ok'],
            ['branch IN (CSE, IT)', 'Enforced server-side', 'ok'],
            ['deadline PASSED', 'Application blocked', 'blocked'],
          ].map(([rule, status, tone]) => (
            <div key={rule} className="lp-rule-row">
              <code>{rule}</code>
              <span className={`lp-rule-status ${tone}`}>
                {tone === 'ok' ? <CheckCircle2 size={12} /> : <X size={12} />} {status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-feature-row reverse">
        <div className="lp-feature-copy">
          <div className="lp-feature-icon"><Sparkles size={18} /></div>
          <h3>AI-generated assessments with human review.</h3>
          <p>Gemini generates draft questions organized by topic and difficulty. Every draft requires explicit human approval before entering any assessment - AI is advisory, a human commits every question.</p>
        </div>
        <div className="lp-feature-visual">
          <div className="lp-ai-draft-label"><Sparkles size={13} /> AI Draft - Requires Human Review</div>
          {[
            'Which React hook is used for side effects?',
            'What is the time complexity of binary search?',
            'Explain event bubbling in JavaScript.',
          ].map(q => (
            <div key={q} className="lp-ai-q-row">
              <span>{q}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge badge-green">Approve</span>
                <span className="badge badge-red">Reject</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-feature-row">
        <div className="lp-feature-copy">
          <div className="lp-feature-icon"><Lock size={18} /></div>
          <h3>Separation of duties. Governance built-in.</h3>
          <p>Admin requests a sensitive change, T&P Head independently approves or rejects it, and the decision is committed to an append-only audit trail. No single actor can bypass the governance layer.</p>
        </div>
        <div className="lp-feature-visual">
          {[
            ['Admin', 'REQUEST', 'Modify eligibility criteria', 'var(--warning)'],
            ['T&P Head', 'REVIEW', 'Verify and approve change', 'var(--accent-mid)'],
            ['System', 'COMMIT', 'Audit event recorded', 'var(--success)'],
          ].map(([role, action, desc, color]) => (
            <div key={role} className="lp-audit-chain-row">
              <div className="lp-audit-chain-dot" style={{ background: color }} />
              <div>
                <div className="lp-audit-chain-role" style={{ color }}>{role} - {action}</div>
                <div className="lp-audit-chain-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function GovernanceSection() {
  return (
    <section className="lp-section lp-section-alt">
      <div className="lp-container">
        <div className="lp-section-head">
          <div className="lp-eyebrow">AI + GOVERNANCE</div>
          <h2 className="lp-h2">AI accelerates. It never decides alone.</h2>
          <p className="lp-h2-sub">This is the core of how PlaceGuard stays trustworthy at institutional scale.</p>
        </div>
        <GovernanceBanner />
        <GovernanceFeatures />
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="lp-final">
      <div className="lp-final-inner">
        <div className="lp-eyebrow">GET STARTED</div>
        <h2 className="lp-h2">Build a more transparent recruitment lifecycle.</h2>
        <p className="lp-h2-sub" style={{ marginBottom: 32 }}>
          Log in with your institution credentials and experience the platform firsthand.
        </p>
        <Link to="/login" className="btn-primary">
          Access PlaceGuard <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="lp-footer">
      <p>&copy; 2026 PlaceGuard &middot; Append-only, tamper-evident audit trail &middot; Built for campus placement governance</p>
    </footer>
  )
}

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <main className="lp">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <NavBar navOpen={navOpen} setNavOpen={setNavOpen} />
      <div id="main-content">
        <Hero />
        <TrustStrip />
        <WhySection />
        <LifecycleSection />
        <AudienceSection />
        <GovernanceSection />
        <FinalCTA />
      </div>
      <Footer />
    </main>
  )
}
