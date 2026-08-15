import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getCompanyRecord, getCompanyDrives } from '../../services/drives'
import { getDriveAssessmentAnalytics } from '../../services/assessments'

function StatBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
      </div>
      <div style={{ height: 6, background: 'var(--card-bg-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

export default function CompanyAnalytics() {
  const { profile } = useAuth()
  const [drives,       setDrives]       = useState([])
  const [selectedDrive, setSelectedDrive] = useState(null)
  const [analytics,    setAnalytics]    = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [aLoading,     setALoading]     = useState(false)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const company = await getCompanyRecord(profile.id)
        if (!company) { if (live) setLoading(false); return }
        const driveList = await getCompanyDrives(company.id)
        if (!live) return
        setDrives(driveList)
        if (driveList.length > 0) setSelectedDrive(driveList[0].id)
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  useEffect(() => {
    if (!selectedDrive) return
    let live = true
    setAnalytics(null)
    setALoading(true)
    getDriveAssessmentAnalytics(selectedDrive)
      .then(d => { if (live) setAnalytics(d) })
      .catch(err => { if (live) setError(err.message) })
      .finally(() => { if (live) setALoading(false) })
    return () => { live = false }
  }, [selectedDrive])

  if (loading) return <div className="page-state"><div className="loading-spinner" /><span>Loading…</span></div>

  const totalAttempts   = analytics?.reduce((s, a) => s + (a.total_attempts  ?? 0), 0) ?? 0
  const totalPassed     = analytics?.reduce((s, a) => s + (a.passed_count    ?? 0), 0) ?? 0
  const avgScore        = analytics?.length
    ? (analytics.reduce((s, a) => s + (a.average_score ?? 0), 0) / analytics.length).toFixed(1)
    : '—'
  const overallPassRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">RECRUITER PORTAL</span>
          <h2>Analytics</h2>
          <p>Assessment performance metrics across your recruitment drives.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Drive selector */}
      {drives.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.7, display: 'block', marginBottom: 6 }}>
            Drive
          </label>
          <select
            value={selectedDrive ?? ''}
            onChange={e => setSelectedDrive(e.target.value)}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', padding: '8px 14px', fontSize: 13 }}
          >
            {drives.map(d => (
              <option key={d.id} value={d.id}>{d.title} — {d.role_name}</option>
            ))}
          </select>
        </div>
      )}

      {drives.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No drives yet</div>
          <div className="empty-state-sub">Create a drive and configure assessments to see analytics.</div>
        </div>
      ) : aLoading ? (
        <div className="page-state"><div className="loading-spinner" /><span>Loading analytics…</span></div>
      ) : !analytics || analytics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No assessment data yet</div>
          <div className="empty-state-sub">Analytics will populate once candidates submit assessments.</div>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
            {[
              { label: 'Total Attempts',   value: totalAttempts,          color: '#4f46e5' },
              { label: 'Passed',           value: totalPassed,            color: '#16a34a' },
              { label: 'Pass Rate',        value: `${overallPassRate}%`,  color: '#d97706' },
              { label: 'Avg Score',        value: avgScore,               color: '#0284c7' },
            ].map(k => (
              <article key={k.label} className="kpi" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-secondary)', marginBottom: 8 }}>{k.label}</div>
                <strong style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</strong>
              </article>
            ))}
          </div>

          {/* Per-round breakdown */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: '1rem' }}>
              Per-Round Breakdown
            </div>
            <div className="data-table-wrap" style={{ marginBottom: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Round / Assessment</th>
                    <th style={{ textAlign: 'center' }}>Attempts</th>
                    <th style={{ textAlign: 'center' }}>Passed</th>
                    <th style={{ textAlign: 'center' }}>Pass Rate</th>
                    <th style={{ textAlign: 'center' }}>Avg Score</th>
                    <th style={{ textAlign: 'center' }}>Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map(a => {
                    const passRate = a.total_attempts > 0
                      ? Math.round((a.passed_count / a.total_attempts) * 100)
                      : 0
                    const avgMins = a.average_time_seconds
                      ? Math.round(a.average_time_seconds / 60)
                      : null
                    return (
                      <tr key={a.assessment_id ?? a.round_id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                            {a.assessment_title ?? a.round_name ?? '—'}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{a.round_name}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}><span style={{ fontWeight: 700 }}>{a.total_attempts ?? 0}</span></td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#16a34a' }}>{a.passed_count ?? 0}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontWeight: 700,
                            color: passRate >= 60 ? '#16a34a' : passRate >= 40 ? '#d97706' : '#dc2626',
                          }}>{passRate}%</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {a.average_score != null ? Number(a.average_score).toFixed(1) : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {avgMins != null ? `${avgMins} min` : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
