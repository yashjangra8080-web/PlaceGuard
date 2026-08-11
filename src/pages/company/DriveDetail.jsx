import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getDriveDetail,
  getDriveApplicantCounts,
  getDriveApplications,
  getDriveAuditTrail,
  publishDrive,
  lockShortlist,
} from '../../services/drives'
import { verifyAuditIntegrity } from '../../services/placement'

export default function DriveDetail() {
  const { driveId } = useParams()
  const { profile } = useAuth()
  const [drive, setDrive] = useState(null)
  const [counts, setCounts] = useState(null)
  const [applications, setApplications] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [integrity, setIntegrity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [driveData, countsData, appsData, auditData] = await Promise.all([
        getDriveDetail(driveId),
        getDriveApplicantCounts(driveId),
        getDriveApplications(driveId),
        getDriveAuditTrail(driveId),
      ])
      setDrive(driveData)
      setCounts(countsData)
      setApplications(appsData)
      setAuditLog(auditData)
      // Verify chain for company users
      try {
        const integ = await verifyAuditIntegrity()
        setIntegrity(integ)
      } catch {
        // Non-fatal: integrity check may fail if no commits yet
        setIntegrity(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let live = true
    loadAll().then(() => !live && undefined)
    return () => { live = false }
  }, [driveId]) // eslint-disable-line react-hooks/exhaustive-deps

  const doAction = async (action) => {
    setActionBusy(true)
    setActionError(null)
    try {
      if (action === 'publish') await publishDrive(driveId)
      if (action === 'lock') await lockShortlist(driveId)
      await loadAll()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionBusy(false)
    }
  }

  if (loading) return <div className="page-state">Loading drive details…</div>
  if (error) return (
    <div className="page-state">
      <div className="alert error">{error}</div>
      <Link className="secondary-button" to="/company" style={{ marginTop: '1rem' }}>← Back to drives</Link>
    </div>
  )
  if (!drive) return null

  const rules = Array.isArray(drive.eligibility_rules) ? drive.eligibility_rules[0] : drive.eligibility_rules
  const canPublish = drive.status === 'draft' && profile.role === 'company'
  const canLock = drive.status === 'open' && profile.role === 'tnp_head'

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">{drive.companies?.company_name || 'COMPANY'} · DRIVE DETAIL</span>
          <h2>{drive.title}</h2>
          <p>{drive.role_name} · Deadline: {new Date(drive.deadline).toLocaleString()}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'flex-end' }}>
          <Link className="secondary-button" to="/company">← All drives</Link>
          <span className={`badge badge-${drive.status}`}>{drive.status}</span>
        </div>
      </div>

      {actionError && <div className="alert error" style={{ marginBottom: '1rem' }}>{actionError}</div>}

      {(canPublish || canLock) && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '.75rem' }}>
          {canPublish && (
            <button className="primary-button" disabled={actionBusy} onClick={() => doAction('publish')}>
              {actionBusy ? 'Publishing…' : 'Publish drive'}
            </button>
          )}
          {canLock && (
            <button className="primary-button" disabled={actionBusy} onClick={() => doAction('lock')}>
              {actionBusy ? 'Locking…' : 'Lock shortlist'}
            </button>
          )}
        </div>
      )}

      {/* Metrics */}
      {counts && (
        <div className="metric-grid" style={{ marginBottom: '1rem' }}>
          <article className="metric">
            <span>Total applications</span>
            <strong>{counts.total}</strong>
            <small>Authorized live data</small>
          </article>
          <article className="metric">
            <span>Eligible candidates</span>
            <strong>{counts.eligible}</strong>
            <small>Passed all eligibility rules</small>
          </article>
          <article className="metric">
            <span>Shortlisted</span>
            <strong>{counts.shortlisted}</strong>
            <small>Approved proposals</small>
          </article>
          {integrity && (
            <article className="metric">
              <span>Audit integrity</span>
              <strong style={{ color: integrity.valid ? '#146647' : '#a3322c' }}>
                {integrity.valid ? 'Verified' : 'FAILURE'}
              </strong>
              <small>
                {integrity.valid
                  ? `${integrity.checked} commits checked`
                  : `Broken at #${integrity.brokenAt}`}
              </small>
            </article>
          )}
        </div>
      )}

      <div className="content-grid">
        {/* Applicants panel */}
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">APPLICANTS</span>
              <h3>Application records</h3>
            </div>
          </div>
          <p style={{ fontSize: '.82rem', color: '#637089', margin: '0 0 .75rem' }}>
            Student identity is protected by RLS. Application IDs and eligibility results are shown.
          </p>
          {applications.length === 0 ? (
            <p className="empty-copy">No applications yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Application ID</th>
                  <th>Status</th>
                  <th>Eligibility</th>
                  <th>Applied</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const res = Array.isArray(app.eligibility_results) ? app.eligibility_results[0] : app.eligibility_results
                  return (
                    <tr key={app.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#637089' }}>
                        {app.id.slice(0, 8)}…
                      </td>
                      <td><span className={`badge badge-${app.status}`}>{app.status}</span></td>
                      <td>
                        {res ? (
                          res.eligible
                            ? <span className="badge badge-ELIGIBLE">Pass</span>
                            : <span className="badge badge-INELIGIBLE">Fail ({(res.failed_rules ?? []).length} rules)</span>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: '.82rem', color: '#637089' }}>
                        {new Date(app.applied_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </article>

        {/* Eligibility rules + Audit trail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rules && (
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ELIGIBILITY RULES</span>
                  <h3>{rules.locked ? 'Rules locked' : 'Rules (draft)'}</h3>
                </div>
                {rules.locked && <span className="status ok">Locked</span>}
              </div>
              <dl className="eligibility-summary" style={{ marginTop: '.75rem' }}>
                <div><dt>Min CGPA</dt><dd>{rules.min_cgpa}</dd></div>
                <div><dt>Max Backlogs</dt><dd>{rules.max_backlogs}</dd></div>
                <div><dt>Branches</dt><dd>{(rules.allowed_branches ?? []).join(', ')}</dd></div>
                {(rules.required_skills ?? []).length > 0 && (
                  <div style={{ gridColumn: 'span 3' }}>
                    <dt>Required skills</dt>
                    <dd>{rules.required_skills.join(', ')}</dd>
                  </div>
                )}
              </dl>
            </article>
          )}

          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">AUDIT TRAIL</span>
                <h3>Recent commits</h3>
              </div>
              {integrity && (
                <span className={`status ${integrity.valid ? 'ok' : 'danger'}`}>
                  {integrity.valid ? 'Chain verified' : 'Integrity failure'}
                </span>
              )}
            </div>
            {auditLog.length === 0 ? (
              <p className="empty-copy">No audit commits for this drive yet.</p>
            ) : (
              <ul className="activity">
                {auditLog.map((commit) => (
                  <li key={commit.id}>
                    <div>
                      <b>{commit.action_type}</b>
                      <span>
                        {commit.reason || commit.status} · #{commit.sequence_number} · {new Date(commit.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span className={`status ${commit.status === 'SUCCESS' ? 'ok' : 'danger'}`}>
                      {commit.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </div>
    </section>
  )
}
