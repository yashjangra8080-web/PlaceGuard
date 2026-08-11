import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getPendingProposals, getAnomalyAlerts, getGovernanceDrives } from '../../services/drives'
import { verifyAuditIntegrity } from '../../services/placement'
import { useDashboardData } from '../../hooks/useDashboardData'

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
