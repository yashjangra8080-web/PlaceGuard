import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getDriveDetail,
  getDriveApplicantCounts,
  getDriveAuditTrail,
  publishDrive,
  lockShortlist,
} from '../../services/drives'
import { getDriveApplicants, getDriveRounds } from '../../services/rounds'
import { verifyAuditIntegrity } from '../../services/placement'
import RoundProgressList from '../../components/rounds/RoundProgressList'
import EvaluateRoundModal from '../../components/rounds/EvaluateRoundModal'

const APP_STATUS_COLORS = {
  ELIGIBLE:    '#0369a1',
  SELECTED:    '#146647',
  REJECTED:    '#a3322c',
  SHORTLISTED: '#6d28d9',
  APPLIED:     '#637089',
}

export default function DriveDetail() {
  const { driveId } = useParams()
  const { profile } = useAuth()
  const [drive, setDrive] = useState(null)
  const [counts, setCounts] = useState(null)
  const [applicants, setApplicants] = useState([])
  const [rounds, setRounds] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [integrity, setIntegrity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [expandedApp, setExpandedApp] = useState(null)
  const [evalTarget, setEvalTarget] = useState(null) // { applicationRound, round, studentName }
  const [tab, setTab] = useState('applicants') // 'applicants' | 'rounds' | 'audit'

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [driveData, countsData, auditData, roundsData] = await Promise.all([
        getDriveDetail(driveId),
        getDriveApplicantCounts(driveId),
        getDriveAuditTrail(driveId),
        getDriveRounds(driveId),
      ])
      setDrive(driveData)
      setCounts(countsData)
      setAuditLog(auditData)
      setRounds(roundsData)

      // Load applicants with round status (company/staff only)
      try {
        const apps = await getDriveApplicants(driveId)
        setApplicants(apps ?? [])
      } catch {
        setApplicants([])
      }

      try {
        const integ = await verifyAuditIntegrity()
        setIntegrity(integ)
      } catch {
        setIntegrity(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [driveId])

  useEffect(() => {
    let live = true
    loadAll().then(() => !live && undefined)
    return () => { live = false }
  }, [loadAll])

  const doAction = async (action) => {
    if (action === 'lock' && !window.confirm('Lock this shortlist? This cannot be undone.')) return
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
      <Link className="secondary-button" to={backTo} style={{ marginTop: '1rem' }}>← Back</Link>
    </div>
  )
  if (!drive) return null

  const rules = Array.isArray(drive.eligibility_rules) ? drive.eligibility_rules[0] : drive.eligibility_rules
  const canPublish = drive.status === 'draft' && profile.role === 'company'
  const canLock = drive.status === 'open' && profile.role === 'tnp_head'
  const backTo = profile.role === 'tnp_head' ? '/tnp' : '/company'
  const backLabel = profile.role === 'tnp_head' ? '← Integrity dashboard' : '← All drives'

  const selectedCount = applicants.filter((a) => a.application_status === 'SELECTED').length
  const rejectedCount = applicants.filter((a) => a.application_status === 'REJECTED').length

  return (
    <section>
      {/* Header */}
      <div className="page-header">
        <div>
          <span className="eyebrow">{drive.companies?.company_name || 'COMPANY'} · DRIVE DETAIL</span>
          <h2>{drive.title}</h2>
          <p>{drive.role_name} · Deadline: {new Date(drive.deadline).toLocaleString()}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'flex-end' }}>
          <Link className="secondary-button" to={backTo}>{backLabel}</Link>
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
            <span>Applications</span>
            <strong>{counts.total}</strong>
            <small>Total submitted</small>
          </article>
          <article className="metric">
            <span>Eligible</span>
            <strong>{counts.eligible}</strong>
            <small>Passed all rules</small>
          </article>
          <article className="metric">
            <span>Selected</span>
            <strong>{selectedCount}</strong>
            <small>All rounds passed</small>
          </article>
          <article className="metric">
            <span>Rejected</span>
            <strong>{rejectedCount}</strong>
            <small>Failed a round</small>
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

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: '1rem' }}>
        {[['applicants', 'Applicants'], ['rounds', 'Round Config'], ['audit', 'Audit Trail']].map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Applicants ── */}
      {tab === 'applicants' && (
        <div>
          {applicants.length === 0 ? (
            <p className="empty-copy">No applicants yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '.65rem' }}>
              {applicants.map((app) => {
                const isOpen = expandedApp === app.application_id
                const appRounds = app.rounds ?? []
                const activeRound = appRounds.find((r) => r.status === 'PENDING')

                return (
                  <div key={app.application_id} className="panel" style={{ padding: '1rem' }}>
                    {/* Student row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '.95rem' }}>{app.student_name}</div>
                        <div style={{ fontSize: '.82rem', color: '#637089' }}>
                          {app.roll_number} · {app.branch} · CGPA {app.cgpa}
                        </div>
                      </div>
                      <span
                        className="badge"
                        style={{
                          background: (APP_STATUS_COLORS[app.application_status] ?? '#637089') + '18',
                          color: APP_STATUS_COLORS[app.application_status] ?? '#637089',
                        }}
                      >
                        {app.application_status}
                      </span>
                      {activeRound && (
                        <span style={{ fontSize: '.8rem', color: '#0369a1' }}>
                          Round {activeRound.round_number}: {activeRound.name}
                        </span>
                      )}
                      <button
                        className="secondary-button"
                        style={{ fontSize: '.8rem', padding: '.3rem .75rem' }}
                        onClick={() => setExpandedApp(isOpen ? null : app.application_id)}
                      >
                        {isOpen ? 'Collapse ▲' : 'View rounds ▼'}
                      </button>
                    </div>

                    {/* Expanded rounds */}
                    {isOpen && (
                      <div style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                        <RoundProgressList
                          rounds={appRounds.map((r) => ({ ...r, round_number: r.round_number }))}
                          studentView={false}
                          busy={actionBusy}
                          onEvaluate={(roundInfo) => {
                            setEvalTarget({
                              applicationRound: roundInfo,
                              round: roundInfo,
                              studentName: app.student_name,
                            })
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Round Config ── */}
      {tab === 'rounds' && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ROUND CONFIGURATION</span>
              <h3>Recruitment pipeline for this drive</h3>
            </div>
            {drive.status === 'draft' && profile.role === 'company' && (
              <span className="badge" style={{ background: '#fffbeb', color: '#7a5c00' }}>
                Draft — rounds can still be added
              </span>
            )}
          </div>
          <RoundProgressList rounds={rounds.map((r) => ({ ...r, status: r.status ?? 'PENDING' }))} studentView={false} />
        </div>
      )}

      {/* ── TAB: Audit Trail ── */}
      {tab === 'audit' && (
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
                      <span>{commit.reason || commit.status} · #{commit.sequence_number} · {new Date(commit.created_at).toLocaleString()}</span>
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
      )}

      {/* Evaluation modal */}
      {evalTarget && (
        <EvaluateRoundModal
          applicationRound={evalTarget.applicationRound}
          round={evalTarget.round}
          studentName={evalTarget.studentName}
          onClose={() => setEvalTarget(null)}
          onSaved={async () => {
            setEvalTarget(null)
            await loadAll()
          }}
        />
      )}
    </section>
  )
}
