import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getCompanyRecord,
  getCompanyDrives,
  getCompanyRecruitmentMetrics,
  createDriveWithRules,
  publishDrive,
} from '../../services/drives'

// ─── Sparkline (pure CSS/SVG) ─────────────────────────────────────────────────
function Sparkline({ values = [], color = '#6366f1' }) {
  const w = 80, h = 32
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - ((v - min) / (max - min + 1)) * h * 0.8 - h * 0.1,
  ])
  return (
    <svg width={w} height={h} className="kpi-sparkline" style={{ position: 'absolute', right: 12, bottom: 12, opacity: 0.4 }}>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
        points={pts.map(p => p.join(',')).join(' ')} />
    </svg>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, trend, trendDir = 'up', color, accentClass, sparkValues, sparkColor }) {
  return (
    <article className={`kpi ${accentClass}`} style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: 0.8, color: 'var(--text-secondary)', display: 'block', marginBottom: 14,
        }}>{label}</span>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>{icon}</div>
      </div>
      <strong style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1, display: 'block', color: 'var(--text-primary)' }}>
        {value}
      </strong>
      {trend && (
        <div className={`kpi-trend ${trendDir}`} style={{ marginTop: 10 }}>
          <span>{trendDir === 'up' ? '↑' : '↓'}</span>
          <span>{trend}</span>
        </div>
      )}
      {sparkValues && <Sparkline values={sparkValues} color={sparkColor || color} />}
    </article>
  )
}

// ─── Funnel Bar ───────────────────────────────────────────────────────────────
function FunnelBar({ label, count, pct, color, icon }) {
  return (
    <div className="funnel-step">
      <div className="funnel-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="funnel-bar-wrap">
        <div
          className="funnel-bar-fill"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}99)` }}
        >
          {pct > 15 && <span style={{ fontSize: 11.5, fontWeight: 700 }}>{count}</span>}
        </div>
      </div>
      <div className="funnel-count">{pct <= 15 ? count : ''}</div>
      <div className="funnel-pct" style={{ fontWeight: 700, color }}>{pct.toFixed(0)}%</div>
    </div>
  )
}

// ─── Upcoming Round Row ───────────────────────────────────────────────────────
function UpcomingRow({ icon, title, date, type, typeColor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{date}</div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
        background: typeColor + '20', color: typeColor, border: `1px solid ${typeColor}40`,
        textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
      }}>{type}</span>
    </div>
  )
}

// ─── Timeline Item ────────────────────────────────────────────────────────────
function TimelineItem({ icon, title, sub, time, color, last }) {
  return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: last ? 0 : 18, position: 'relative' }}>
      {!last && (
        <div style={{
          position: 'absolute', left: 15, top: 32, bottom: 0,
          width: 1, background: 'rgba(255,255,255,0.05)',
        }} />
      )}
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: color + '18', border: `1px solid ${color}35`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', paddingTop: 2 }}>{time}</div>
    </div>
  )
}

// ─── Donut chart (SVG, CSS-only) ──────────────────────────────────────────────
// ─── AI Insight Item ──────────────────────────────────────────────────────────
function AiInsight({ icon, text, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 14px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 10, marginBottom: 8,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: accent + '18', border: `1px solid ${accent}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13,
      }}>{icon}</div>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

// ─── Process Step ─────────────────────────────────────────────────────────────
function ProcessStepBox({ icon, title, sub, aiPowered, color }) {
  return (
    <div style={{
      flex: '1 1 140px', background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12,
      padding: '18px 16px', textAlign: 'center', position: 'relative',
    }}>
      {aiPowered && (
        <div style={{
          position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
          fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
          background: 'var(--purple-bg)', color: 'var(--purple)',
          border: '1px solid rgba(167,139,250,0.25)', letterSpacing: 0.5, whiteSpace: 'nowrap',
        }}>AI-POWERED</div>
      )}
      <div style={{
        width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
        background: color + '18', border: `1px solid ${color}35`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

// ─── Drive Status Actions ─────────────────────────────────────────────────────
const DRIVE_STATUS_ACTIONS = {
  draft: 'Publish', open: null, closed: null, locked: null, completed: null,
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CompanyDashboard() {
  const { profile } = useAuth()
  const [company, setCompany]   = useState(null)
  const [drives, setDrives]     = useState([])
  const [metrics, setMetrics]   = useState({ drives: 0, open_drives: 0, applications: 0, in_assessment: 0, shortlisted: 0, selected: 0, rejected: 0 })
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [publishing, setPublishing] = useState({})
  const [pubError, setPubError]   = useState({})
  const [activeTab, setActiveTab] = useState('overview')

  const [form, setForm] = useState({
    title: '', description: '', roleName: '', deadline: '',
    minCgpa: '', maxBacklogs: '0', allowedBranches: '', requiredSkills: '',
  })
  const [formBusy, setFormBusy]   = useState(false)
  const [formError, setFormError] = useState(null)

  const loadData = async () => {
    setLoading(true); setError(null)
    try {
      const companyRecord = await getCompanyRecord(profile.id)
      setCompany(companyRecord)
      if (companyRecord) {
        const [drivesData, metricsData] = await Promise.all([getCompanyDrives(companyRecord.id), getCompanyRecruitmentMetrics()])
        setDrives(drivesData)
        setMetrics(metricsData)
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePublish = async (driveId) => {
    setPublishing(p => ({ ...p, [driveId]: true }))
    setPubError(p => ({ ...p, [driveId]: null }))
    try {
      await publishDrive(driveId)
      const [updated, metricsData] = await Promise.all([getCompanyDrives(company.id), getCompanyRecruitmentMetrics()])
      setDrives(updated)
      setMetrics(metricsData)
    } catch (err) { setPubError(p => ({ ...p, [driveId]: err.message })) }
    finally { setPublishing(p => ({ ...p, [driveId]: false })) }
  }

  const handleCreateDrive = async (e) => {
    e.preventDefault(); setFormBusy(true); setFormError(null)
    try {
      const branches = form.allowedBranches.split(',').map(b => b.trim()).filter(Boolean)
      const skills   = form.requiredSkills.split(',').map(s => s.trim()).filter(Boolean)
      if (branches.length === 0) throw new Error('At least one allowed branch is required.')
      if (!form.deadline) throw new Error('Deadline is required.')
      await createDriveWithRules({
        title: form.title, description: form.description,
        roleName: form.roleName, deadline: new Date(form.deadline).toISOString(),
        minCgpa: parseFloat(form.minCgpa), maxBacklogs: parseInt(form.maxBacklogs, 10),
        allowedBranches: branches, requiredSkills: skills,
      })
      setForm({ title:'',description:'',roleName:'',deadline:'',minCgpa:'',maxBacklogs:'0',allowedBranches:'',requiredSkills:'' })
      setShowForm(false)
      const [updated, metricsData] = await Promise.all([getCompanyDrives(company.id), getCompanyRecruitmentMetrics()])
      setDrives(updated)
      setMetrics(metricsData)
    } catch (err) { setFormError(err.message) }
    finally { setFormBusy(false) }
  }

  // ── Summary stats (computed from real drives) ──
  const openDrives = metrics.open_drives

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  if (loading) return (
    <div className="page-state">
      <div className="loading-spinner" />
      <span>Loading your recruitment dashboard…</span>
    </div>
  )

  if (!company && !error) return (
    <section>
      <div className="page-header">
        <div><span className="eyebrow">Company Portal</span><h2>Drive Overview</h2></div>
      </div>
      <div className="alert warning">
        Your company profile has not been configured. Contact the placement office administrator.
      </div>
    </section>
  )

  const companyName = company?.company_name || profile?.name || 'Company'

  return (
    <div className="animate-fadein">
      {/* ── Dashboard Header ── */}
      <div className="dash-header-row" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-mid)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
            Company Portal
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.6, marginBottom: 4 }}>
            {greeting}, {profile?.name?.split(' ')[0] || 'there'}! 👋
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {companyName} · Track, assess, and hire the best talent with PlaceGuard.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="secondary-button btn-sm" to="/company/assessments">
            🧪 Assessments
          </Link>
          <button className="primary-button btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancel' : '+ Create Drive'}
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {/* ── Tabs ── */}
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {[['overview','Overview'],['drives','Drives'],['ai','AI Insights'],['pipeline','Recruitment Pipeline']].map(([id, label]) => (
          <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════ OVERVIEW TAB ═══════════ */}
      {activeTab === 'overview' && (
        <>
          {/* KPI Grid */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', marginBottom: 24 }}>
            <KpiCard
              icon="📋" label="Total Applications"
              value={metrics.applications}
              trend="Live database count" trendDir="up"
              color="#6366f1" accentClass="kpi-accent"
              sparkValues={[0, metrics.applications]}
              sparkColor="#6366f1"
            />
            <KpiCard
              icon="⚡" label="In Assessment"
              value={metrics.in_assessment}
              trend="Live database count" trendDir="up"
              color="#f59e0b" accentClass="kpi-warning"
              sparkValues={[0, metrics.in_assessment]}
              sparkColor="#f59e0b"
            />
            <KpiCard
              icon="🎯" label="Shortlisted"
              value={metrics.shortlisted}
              trend="Live database count" trendDir="up"
              color="#10b981" accentClass="kpi-success"
              sparkValues={[0, metrics.shortlisted]}
              sparkColor="#10b981"
            />
            <KpiCard
              icon="🏆" label="Hires Made"
              value={metrics.selected}
              trend="Live deterministic outcomes" trendDir="up"
              color="#a78bfa" accentClass="kpi-purple"
              sparkValues={[0, metrics.selected]}
              sparkColor="#a78bfa"
            />
          </div>

          {/* Main grid: funnel + upcoming */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 20 }}>
            {/* Recruitment Funnel */}
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Analytics</span>
                  <h3>Recruitment Funnel</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Active pipeline · {openDrives} open drive{openDrives !== 1 ? 's' : ''}
                  </p>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--success)',
                  background: 'var(--success-bg)', padding: '4px 10px', borderRadius: 7,
                  border: '1px solid var(--success-border)',
                }}>
                  {metrics.applications ? `${((metrics.selected / metrics.applications) * 100).toFixed(1)}% conversion` : 'No applications'}
                </div>
              </div>
              <div className="funnel-container">
                <FunnelBar icon="📬" label="Applications Received" count={metrics.applications} pct={100} color="#6366f1" />
                <FunnelBar icon="📝" label="In Assessment" count={metrics.in_assessment} pct={metrics.applications ? (metrics.in_assessment / metrics.applications) * 100 : 0} color="#38bdf8" />
                <FunnelBar icon="👥" label="Shortlisted" count={metrics.shortlisted} pct={metrics.applications ? (metrics.shortlisted / metrics.applications) * 100 : 0} color="#10b981" />
                <FunnelBar icon="✅" label="Selected" count={metrics.selected} pct={metrics.applications ? (metrics.selected / metrics.applications) * 100 : 0} color="#2dd4bf" />
                <FunnelBar icon="✕" label="Rejected" count={metrics.rejected} pct={metrics.applications ? (metrics.rejected / metrics.applications) * 100 : 0} color="#ef4444" />
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Upcoming Rounds */}
              <div className="panel" style={{ marginBottom: 0 }}>
                <div className="panel-heading">
                  <div><span className="eyebrow">Current data</span><h3>Recruitment Status</h3></div>
                </div>
                <UpcomingRow icon="🚀" title={`${metrics.open_drives} open drive${metrics.open_drives === 1 ? '' : 's'}`} date="Live server state" type="Open" typeColor="var(--success)" />
                <UpcomingRow icon="📋" title={`${metrics.drives} total drive${metrics.drives === 1 ? '' : 's'}`} date="Live server state" type="Configured" typeColor="var(--info)" />
              </div>

              {/* Skills Donut */}
              <div className="panel" style={{ marginBottom: 0 }}>
                <div className="panel-heading">
                  <div><span className="eyebrow">Official outcomes</span><h3>Candidate Decisions</h3></div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  {metrics.selected} selected, {metrics.rejected} rejected, and {metrics.shortlisted} shortlisted from actual workflow records.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom row: Active Drives + Timeline */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
            {/* Active Drives */}
            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-heading">
                <div><span className="eyebrow">Active</span><h3>Placement Drives</h3></div>
                <button className="btn-ghost btn-sm" onClick={() => setActiveTab('drives')}>View all →</button>
              </div>
              {drives.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🚀</div>
                  <h4>No drives yet</h4>
                  <p>Create your first placement drive to start accepting applications.</p>
                  <button className="primary-button btn-sm" onClick={() => { setShowForm(true); setActiveTab('drives') }}>+ Create Drive</button>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Drive</th>
                        <th>Status</th>
                        <th>Applications</th>
                        <th>Deadline</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drives.slice(0, 5).map(drive => (
                        <tr key={drive.id}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 2 }}>{drive.title}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{drive.role_name}</div>
                          </td>
                          <td><span className={`badge badge-${drive.status}`}>{drive.status}</span></td>
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {drive._app_count ?? '—'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {new Date(drive.deadline).toLocaleDateString()}
                          </td>
                          <td>
                            <Link className="btn-ghost btn-xs" to={`/company/drives/${drive.id}`}>Details →</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-heading">
                <div><span className="eyebrow">Live Feed</span><h3>Recent Activity</h3></div>
              </div>
              <p className="empty-copy">Live candidate activity is shown in each drive’s controlled workflow. Current total: {metrics.applications} application{metrics.applications === 1 ? '' : 's'}.</p>

            </div>
          </div>
        </>
      )}

      {/* ═══════════ DRIVES TAB ═══════════ */}
      {activeTab === 'drives' && (
        <>
          {/* Create Drive Form */}
          {showForm && (
            <div className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow">Create</span><h3>New Placement Drive</h3></div>
                <button className="btn-ghost btn-sm" onClick={() => setShowForm(false)}>✕ Cancel</button>
              </div>
              <form onSubmit={handleCreateDrive}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Drive title <span>*</span></label>
                    <input className="form-input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Software Engineer Campus Hiring" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role name <span>*</span></label>
                    <input className="form-input" required value={form.roleName} onChange={e => setForm(f => ({ ...f, roleName: e.target.value }))} placeholder="e.g. Software Engineer" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Application deadline <span>*</span></label>
                    <input className="form-input" required type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min CGPA <span>*</span></label>
                    <input className="form-input" required type="number" step="0.01" min="0" max="10" value={form.minCgpa} onChange={e => setForm(f => ({ ...f, minCgpa: e.target.value }))} placeholder="7.5" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Max backlogs <span>*</span></label>
                    <input className="form-input" required type="number" min="0" value={form.maxBacklogs} onChange={e => setForm(f => ({ ...f, maxBacklogs: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Allowed branches <span>*</span> <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(comma-separated)</span></label>
                    <input className="form-input" required value={form.allowedBranches} onChange={e => setForm(f => ({ ...f, allowedBranches: e.target.value }))} placeholder="CSE, IT, ECE" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Required skills <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(optional, comma-separated)</span></label>
                  <input className="form-input" value={form.requiredSkills} onChange={e => setForm(f => ({ ...f, requiredSkills: e.target.value }))} placeholder="JavaScript, React, DSA" />
                </div>
                {formError && <div className="alert error">{formError}</div>}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="primary-button" type="submit" disabled={formBusy}>
                    {formBusy ? '⏳ Creating…' : '✓ Create Drive (Draft)'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
                  Created as draft. Publish to open applications. Eligibility rules lock on publish.
                </p>
              </form>
            </div>
          )}

          {/* Drive Cards */}
          {drives.length === 0 ? (
            <div className="panel">
              <div className="empty-state">
                <div className="empty-state-icon">🚀</div>
                <h4>No drives yet</h4>
                <p>Create your first placement drive to start accepting applications from eligible candidates.</p>
                <button className="primary-button btn-sm" onClick={() => setShowForm(true)}>+ Create First Drive</button>
              </div>
            </div>
          ) : (
            <div className="drive-grid">
              {drives.map(drive => {
                const rules = Array.isArray(drive.eligibility_rules) ? drive.eligibility_rules[0] : drive.eligibility_rules
                return (
                  <div className="drive-card" key={drive.id}>
                    <div className="drive-card-header">
                      <div>
                        <div style={{ marginBottom: 6 }}>
                          <span className={`badge badge-${drive.status}`}>{drive.status}</span>
                        </div>
                        <h3>{drive.title}</h3>
                        <p>{drive.role_name}</p>
                      </div>
                    </div>

                    {rules && (
                      <dl className="eligibility-summary">
                        <div><dt>Min CGPA</dt><dd>{rules.min_cgpa}</dd></div>
                        <div><dt>Max Backlogs</dt><dd>{rules.max_backlogs}</dd></div>
                        <div><dt>Branches</dt><dd style={{ fontSize: 11.5 }}>{(rules.allowed_branches ?? []).join(', ')}</dd></div>
                      </dl>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Deadline: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{new Date(drive.deadline).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {pubError[drive.id] && <div className="inline-error" style={{ marginBottom: 8 }}>{pubError[drive.id]}</div>}

                    <div className="drive-card-footer">
                      {DRIVE_STATUS_ACTIONS[drive.status] && (
                        <button
                          className="primary-button btn-sm"
                          disabled={publishing[drive.id]}
                          onClick={() => handlePublish(drive.id)}
                        >
                          {publishing[drive.id] ? '⏳ Publishing…' : '🚀 Publish'}
                        </button>
                      )}
                      <Link className="secondary-button btn-sm" to={`/company/drives/${drive.id}`}>
                        View Details →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════ AI INSIGHTS TAB ═══════════ */}
      {activeTab === 'ai' && (
        <div className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Advisory only</span><h3>AI Recruitment Intelligence</h3></div>
            <Link className="primary-button btn-sm" to="/company/drives">Manage real assessments</Link>
          </div>
          <p className="empty-copy">
            AI summaries are generated only from completed assessment records. No summary is available until this company has real assessment data.
          </p>
        </div>
      )}


      {/* ═══════════ PIPELINE TAB ═══════════ */}
      {activeTab === 'pipeline' && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Recruitment Flow</span>
              <h3>AI-Driven Placement Pipeline</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                The complete end-to-end recruitment journey on PlaceGuard
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {[
              { icon: '📋', title: 'Candidate Applies', sub: 'Student submits application to the drive', ai: false, color: '#6366f1' },
              { icon: '✓', title: 'Eligibility Check', sub: 'Server-side CGPA, backlog, branch validation', ai: false, color: '#38bdf8' },
              { icon: '📝', title: 'Aptitude Test', sub: 'MCQ assessment with auto-scoring', ai: true, color: '#f59e0b' },
              { icon: '💻', title: 'DSA Round', sub: 'AI generates & evaluates coding problems', ai: true, color: '#a78bfa' },
              { icon: '🤖', title: 'AI Evaluation', sub: 'Complexity, quality, edge case analysis', ai: true, color: '#6366f1' },
              { icon: '🎤', title: 'Technical Interview', sub: 'Human-led technical assessment', ai: false, color: '#10b981' },
              { icon: '👥', title: 'HR Interview', sub: 'Cultural fit and soft skills evaluation', ai: false, color: '#2dd4bf' },
              { icon: '🏆', title: 'Final Selection', sub: 'Offer letter, audit trail committed', ai: false, color: '#10b981' },
            ].map((step, i, arr) => (
              <div key={step.title} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 140, background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12,
                  padding: '18px 14px', textAlign: 'center', position: 'relative',
                }}>
                  {step.ai && (
                    <div style={{
                      position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                      fontSize: 8.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6,
                      background: 'var(--purple-bg)', color: 'var(--purple)',
                      border: '1px solid rgba(167,139,250,0.25)', letterSpacing: 0.5, whiteSpace: 'nowrap',
                    }}>✨ AI</div>
                  )}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, margin: '0 auto 10px',
                    background: step.color + '18', border: `1px solid ${step.color}35`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>{step.icon}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.sub}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 18, flexShrink: 0 }}>›</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create drive form (for drives tab) */}
      {activeTab === 'drives' && !showForm && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button className="primary-button" onClick={() => setShowForm(true)}>
            + Create New Drive
          </button>
        </div>
      )}
    </div>
  )
}
