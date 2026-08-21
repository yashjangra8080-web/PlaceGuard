import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getPendingProposals, getAnomalyAlerts, getGovernanceDrives } from '../../services/drives'
import { verifyAuditIntegrity } from '../../services/placement'
import { useDashboardData } from '../../hooks/useDashboardData'
import { governanceSummary } from '../../services/ai'

export default function TnpDashboard() {
  const { profile } = useAuth()
  const { data: dashData } = useDashboardData(profile)
  const [pendingCount, setPendingCount] = useState(null)
  const [anomalyCount, setAnomalyCount] = useState(null)
  const [integrity, setIntegrity] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [drives, setDrives] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // AI governance summary — advisory only, never makes decisions
  const [aiGov, setAiGov] = useState(null)
  const [aiGovLoading, setAiGovLoading] = useState(false)
  const [aiGovError, setAiGovError] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [pending, anom, integ, driveData] = await Promise.all([
          getPendingProposals(),
          getAnomalyAlerts(),
          verifyAuditIntegrity().catch(() => null),
          getGovernanceDrives(),
        ])
        if (!live) return
        setPendingCount(pending.length)
        setAnomalyCount(anom.length)
        setAnomalies(anom.slice(0, 5))
        setIntegrity(integ)
        setDrives(driveData)
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  const handleAiGovernanceSummary = async () => {
    setAiGovLoading(true)
    setAiGovError(null)
    try {
      const result = await governanceSummary({
        drives: drives.map(d => ({ title: d.title, status: d.status, role: d.role_name })),
        pending_approvals: pendingCount ?? 0,
        anomalies: anomalies.map(a => ({ type: a.type, severity: a.severity, description: a.description })),
        pending_changes: 0,
      })
      setAiGov(result.summary)
    } catch (err) {
      setAiGovError(err.message || 'AI governance summary temporarily unavailable.')
    } finally {
      setAiGovLoading(false)
    }
  }

  const activity = dashData?.activity ?? []

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">T&P HEAD PORTAL</span>
          <h2>Placement Integrity</h2>
          <p>Monitor audit health, pending proposals, and anomaly alerts across all drives.</p>
        </div>
        <Link className="primary-button" to="/tnp/approvals">Review proposals →</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* AI Governance Summary — advisory only */}
      <article className="ai-panel" style={{ marginBottom: '1rem' }}>
        <div className="ai-panel-header">
          <div className="ai-icon">🏛️</div>
          <div>
            <div className="ai-panel-title">✨ AI Governance Summary</div>
            <div className="ai-panel-sub">Powered by Gemini · Advisory only — T&P Head remains the governance authority</div>
          </div>
          {!aiGov && (
            <button
              className="primary-button btn-sm"
              style={{ background: '#7c3aed', marginLeft: 'auto' }}
              onClick={handleAiGovernanceSummary}
              disabled={aiGovLoading || loading}
            >
              {aiGovLoading ? '✨ Generating…' : '✨ Get Summary'}
            </button>
          )}
          {aiGov && (
            <button className="secondary-button btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setAiGov(null); setAiGovError(null) }}>
              Refresh
            </button>
          )}
        </div>

        {aiGovError && <div className="alert error" style={{ marginTop: 10 }}>{aiGovError}</div>}

        {aiGovLoading && (
          <div className="page-state" style={{ minHeight: 50, marginTop: 10 }}>
            <div className="loading-spinner" />
            <span>Calling Gemini — this may take 10–20 seconds…</span>
          </div>
        )}

        {!aiGov && !aiGovLoading && !aiGovError && (
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '10px 0 0' }}>
            Click "Get Summary" to generate an AI advisory overview of current governance status based on real data.
          </p>
        )}

        {aiGov && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {aiGov.status_overview && (
              <div style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.18)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Status Overview</div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>{aiGov.status_overview}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {Array.isArray(aiGov.key_actions_required) && aiGov.key_actions_required.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>⚡ Key Actions Required</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {aiGov.key_actions_required.map((a, i) => <li key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{a}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(aiGov.risk_flags) && aiGov.risk_flags.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>🚩 Risk Flags</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {aiGov.risk_flags.map((r, i) => <li key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {Array.isArray(aiGov.positive_signals) && aiGov.positive_signals.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 6 }}>✓ Positive Signals</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {aiGov.positive_signals.map((s, i) => (
                    <span key={i} style={{ fontSize: 11.5, padding: '3px 10px', background: '#d1fae5', color: '#065f46', borderRadius: 6, border: '1px solid #6ee7b7' }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic' }}>
              {aiGov.disclaimer || 'AI-generated advisory summary. T&P Head remains the sole governance authority for all decisions.'}
            </p>
          </div>
        )}
      </article>

      {loading ? (
        <div className="page-state" style={{ minHeight: '30vh' }}>Loading integrity data…</div>
      ) : (
        <>
          <div className="metric-grid" style={{ marginBottom: '1rem' }}>
            <article className="metric">
              <span>Pending proposals</span>
              <strong>{pendingCount ?? '—'}</strong>
              <small>
                {pendingCount === 0 ? 'All reviewed' : 'Require your review'}
              </small>
            </article>
            <article className="metric">
              <span>Open anomalies</span>
              <strong style={{ color: anomalyCount > 0 ? '#a3322c' : '#146647' }}>
                {anomalyCount ?? '—'}
              </strong>
              <small>{anomalyCount === 0 ? 'No open anomalies' : 'Integrity alerts'}</small>
            </article>
            <article className="metric">
              <span>Audit integrity</span>
              <strong style={{ color: integrity?.valid === false ? '#a3322c' : '#146647' }}>
                {integrity === null ? '—' : integrity.valid ? 'Verified' : 'FAILURE'}
              </strong>
              <small>
                {integrity === null
                  ? 'No commits yet'
                  : integrity.valid
                  ? `${integrity.checked} commits checked`
                  : `Broken at #${integrity.brokenAt}`}
              </small>
            </article>
            {dashData?.metrics?.map(([label, value]) => (
              <article className="metric" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>Authorized live data</small>
              </article>
            ))}
          </div>

          {!integrity?.valid && integrity !== null && (
            <div className="alert error" style={{ marginBottom: '1rem' }}>
              <strong>Audit chain integrity failure.</strong> The hash chain is broken at commit #{integrity.brokenAt}. This may indicate tampered historical records. Contact your database administrator immediately.
            </div>
          )}

          <article className="panel" style={{ marginBottom: '1rem' }}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SHORTLIST LOCKING</span>
                <h3>Drives ready for governance review</h3>
              </div>
            </div>
            {drives.length === 0 ? (
              <p className="empty-copy">No open or closed drives are available for shortlist review.</p>
            ) : (
              <div style={{ display: 'grid', gap: '.65rem', marginTop: '.75rem' }}>
                {drives.map((drive) => (
                  <div className="candidate-row" key={drive.id}>
                    <div>
                      <strong>{drive.title}</strong>
                      <small>{drive.companies?.company_name || 'Company'} · {drive.role_name} · Deadline: {new Date(drive.deadline).toLocaleString()}</small>
                    </div>
                    <Link className="secondary-button" to={`/tnp/drives/${drive.id}`}>Review shortlist →</Link>
                  </div>
                ))}
              </div>
            )}
          </article>

          <div className="content-grid">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">RECENT ACTIVITY</span>
                  <h3>Audit timeline</h3>
                </div>
                {integrity && (
                  <span className={`status ${integrity.valid ? 'ok' : 'danger'}`}>
                    {integrity.valid ? 'Chain verified' : 'Integrity failure'}
                  </span>
                )}
              </div>
              {activity.length === 0 ? (
                <p className="empty-copy">No audit events yet.</p>
              ) : (
                <ul className="activity">
                  {activity.map((event) => (
                    <li key={event.id}>
                      <div>
                        <b>{event.action_type}</b>
                        <span>{event.reason || event.status} · {new Date(event.created_at).toLocaleString()}</span>
                      </div>
                      <span className={`status ${event.status === 'SUCCESS' ? 'ok' : 'danger'}`}>
                        {event.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ANOMALY ALERTS</span>
                  <h3>Open alerts</h3>
                </div>
              </div>
              {anomalies.length === 0 ? (
                <p className="empty-copy">No open anomaly alerts.</p>
              ) : (
                anomalies.map((a) => (
                  <div className="anomaly-item" key={a.id}>
                    <div className="anomaly-info">
                      <strong>{a.type}</strong>
                      <small>{a.description}</small>
                      {a.drives?.title && <small style={{ color: '#42526a' }}>Drive: {a.drives.title}</small>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', alignItems: 'flex-end' }}>
                      <span className={`badge badge-${a.severity}`}>{a.severity}</span>
                      <span style={{ fontSize: '.78rem', color: '#637089' }}>Risk: {a.risk_score}</span>
                    </div>
                  </div>
                ))
              )}
              {anomalyCount > 5 && (
                <p style={{ fontSize: '.82rem', color: '#637089', marginTop: '.75rem', textAlign: 'center' }}>
                  +{anomalyCount - 5} more open anomalies.
                </p>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  )
}
