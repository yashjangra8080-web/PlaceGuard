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
import { getDriveApplicants, getDriveRounds, addDriveRound } from '../../services/rounds'
import { verifyAuditIntegrity } from '../../services/placement'
import RoundProgressList from '../../components/rounds/RoundProgressList'
import EvaluateRoundModal from '../../components/rounds/EvaluateRoundModal'

const APP_STATUS_COLORS = {
  ELIGIBLE:    '#0369a1',
  SELECTED:    '#146647',
  REJECTED:    '#a3322c',
  SHORTLISTED: '#6d28d9',
  APPLIED:     'var(--text-secondary)',
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

  // ── Round creation form state ──────────────────────────────────────────────
  const [showRoundForm, setShowRoundForm] = useState(false)
  const [roundForm, setRoundForm] = useState({
    name: '', roundType: 'APTITUDE', description: '',
    isElimination: true, passingScore: '', maxScore: '',
  })
  const [roundBusy, setRoundBusy] = useState(false)
  const [roundError, setRoundError] = useState(null)

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
      } catch (err) {
        // Surface the error so it's visible — don't silently return empty list
        setError((prev) => prev ?? `Could not load applicants: ${err.message}`)
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

  const handleAddRound = async (e) => {
    e.preventDefault()
    setRoundBusy(true)
    setRoundError(null)
    try {
      const nextNumber = rounds.length + 1
      await addDriveRound({
        driveId,
        roundNumber: nextNumber,
        name: roundForm.name.trim(),
        roundType: roundForm.roundType,
        description: roundForm.description.trim(),
        isElimination: roundForm.isElimination,
        passingScore: roundForm.passingScore !== '' ? parseFloat(roundForm.passingScore) : null,
        maxScore: roundForm.maxScore !== '' ? parseFloat(roundForm.maxScore) : null,
      })
      // Reset form and reload rounds list
      setRoundForm({ name: '', roundType: 'APTITUDE', description: '', isElimination: true, passingScore: '', maxScore: '' })
      setShowRoundForm(false)
      const updated = await getDriveRounds(driveId)
      setRounds(updated)
    } catch (err) {
      setRoundError(err.message)
    } finally {
      setRoundBusy(false)
    }
  }

  if (loading) return <div className="page-state"><div className="loading-spinner" /><span>Loading drive details…</span></div>
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
              <strong style={{ color: integrity.valid ? 'var(--success)' : 'var(--danger)' }}>
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
                        <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>
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
                        <span style={{ fontSize: '.8rem', color: 'var(--info)' }}>
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
                      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Header row */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">ROUND CONFIGURATION</span>
                <h3>Recruitment pipeline for this drive</h3>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                {drive.status === 'draft' && profile.role === 'company' && (
                  <span className="badge" style={{ background: '#fffbeb', color: '#7a5c00' }}>
                    Draft — rounds can still be added
                  </span>
                )}
                {drive.status === 'draft' && profile.role === 'company' && !showRoundForm && (
                  <button
                    className="primary-button btn-sm"
                    onClick={() => { setShowRoundForm(true); setRoundError(null) }}
                  >
                    + Add Round
                  </button>
                )}
              </div>
            </div>

            {/* Existing rounds list */}
            {rounds.length === 0 ? (
              <p className="empty-copy" style={{ marginTop: '.75rem' }}>
                No rounds configured yet.
                {drive.status === 'draft' && profile.role === 'company' && ' Use "+ Add Round" above to configure the recruitment pipeline.'}
              </p>
            ) : (
              <ol className="round-list" style={{ marginTop: '.75rem' }} aria-label="Configured rounds">
                {rounds.map((r) => (
                  <li key={r.id} className="round-item round-pending" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '.75rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="round-number-badge" style={{ background: '#0369a118', color: 'var(--info)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                      {r.round_number}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '.93rem' }}>
                        {r.name}
                        <span className="round-type-pill" style={{ marginLeft: '.4rem' }}>{r.round_type?.replace(/_/g, ' ')}</span>
                        {r.is_elimination && <span className="round-elim-badge" style={{ marginLeft: '.3rem' }}>Elim</span>}
                      </div>
                      {r.description && <p className="round-desc" style={{ fontSize: '.82rem', color: 'var(--text-secondary)', margin: '.2rem 0 0' }}>{r.description}</p>}
                      {(r.max_score != null || r.passing_score != null) && (
                        <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>
                          {r.max_score != null && `Max: ${r.max_score}`}
                          {r.max_score != null && r.passing_score != null && ' · '}
                          {r.passing_score != null && `Pass: ${r.passing_score}`}
                        </span>
                      )}
                    </div>
                    {/* Link to assessment manager for this round */}
                    <Link
                      className="secondary-button btn-sm"
                      to={`/company/drives/${driveId}/assessment/${r.id}`}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Manage Assessment →
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Add Round form — only shown for draft drives owned by company */}
          {showRoundForm && drive.status === 'draft' && profile.role === 'company' && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">NEW ROUND</span>
                  <h3>Round {rounds.length + 1}</h3>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => { setShowRoundForm(false); setRoundError(null) }}>✕ Cancel</button>
              </div>

              <form onSubmit={handleAddRound} style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', marginTop: '.5rem' }}>
                {/* Row 1: name + type */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Round name <span>*</span></label>
                    <input
                      className="form-input"
                      required
                      placeholder="e.g. Aptitude Test"
                      value={roundForm.name}
                      onChange={e => setRoundForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Round type <span>*</span></label>
                    <select
                      className="form-input"
                      value={roundForm.roundType}
                      onChange={e => setRoundForm(f => ({ ...f, roundType: e.target.value }))}
                    >
                      <option value="APTITUDE">Aptitude</option>
                      <option value="CODING">Coding</option>
                      <option value="SQL_ASSESSMENT">SQL / Python</option>
                      <option value="LINUX_ASSESSMENT">Linux / Networking</option>
                      <option value="CLOUD_ASSESSMENT">Cloud Assessment</option>
                      <option value="ASSESSMENT">General Assessment</option>
                      <option value="TECHNICAL_INTERVIEW">Technical Interview</option>
                      <option value="HR_INTERVIEW">HR Interview</option>
                      <option value="GROUP_DISCUSSION">Group Discussion</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: description */}
                <div className="form-group">
                  <label className="form-label">Description / instructions</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder="Optional — describe what this round tests"
                    value={roundForm.description}
                    onChange={e => setRoundForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>

                {/* Row 3: scores + elimination */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Max score</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="e.g. 100"
                      value={roundForm.maxScore}
                      onChange={e => setRoundForm(f => ({ ...f, maxScore: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Passing score</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="e.g. 60"
                      value={roundForm.passingScore}
                      onChange={e => setRoundForm(f => ({ ...f, passingScore: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                    <label className="form-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '1.6rem' }}>
                      <input
                        type="checkbox"
                        checked={roundForm.isElimination}
                        onChange={e => setRoundForm(f => ({ ...f, isElimination: e.target.checked }))}
                      />
                      Elimination round
                    </label>
                  </div>
                </div>

                {roundError && <div className="alert error">{roundError}</div>}

                <div style={{ display: 'flex', gap: '.6rem' }}>
                  <button className="primary-button" type="submit" disabled={roundBusy}>
                    {roundBusy ? '⏳ Saving…' : `✓ Add Round ${rounds.length + 1}`}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => { setShowRoundForm(false); setRoundError(null) }}>
                    Cancel
                  </button>
                </div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-tertiary)', margin: 0 }}>
                  After adding all rounds, go to each round's "Manage Assessment" to create and activate a Gemini-generated test.
                </p>
              </form>
            </div>
          )}
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
