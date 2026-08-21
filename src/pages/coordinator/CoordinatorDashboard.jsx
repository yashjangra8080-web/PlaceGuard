import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDrivesWithEligibleCandidates } from '../../services/drives'
import { getDriveApplicants } from '../../services/rounds'
import { proposeShortlistChange } from '../../services/placement'

// ── Round status display helpers ──────────────────────────────────────────────
const ROUND_STATUS_META = {
  PENDING:  { label: 'Available',   color: '#4f46e5', bg: '#ede9fe' },
  ACTIVE:   { label: 'In Progress', color: '#d97706', bg: '#fef3c7' },
  PASSED:   { label: 'Passed',      color: '#059669', bg: '#d1fae5' },
  FAILED:   { label: 'Failed',      color: '#dc2626', bg: '#fee2e2' },
  ABSENT:   { label: 'Absent',      color: '#6b7280', bg: '#f3f4f6' },
  LOCKED:   { label: 'Locked',      color: '#94a3b8', bg: '#f1f5f9' },
}

function RoundChip({ status }) {
  const s = ROUND_STATUS_META[status] ?? { label: status, color: '#64748b', bg: '#f1f5f9' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 20, display: 'inline-block',
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  )
}

const APP_STATUS_CLS = {
  ELIGIBLE:    'badge-ELIGIBLE',
  SELECTED:    'badge-SELECTED',
  REJECTED:    'badge-REJECTED',
  INELIGIBLE:  'badge-INELIGIBLE',
  SHORTLISTED: 'badge-SHORTLISTED',
}

function AppBadge({ status }) {
  return <span className={`badge ${APP_STATUS_CLS[status] ?? ''}`}>{status}</span>
}

/**
 * Summarise where this candidate currently is in the round journey.
 * get_drive_applicants returns `rounds` array sorted by round_number.
 */
function activeRoundSummary(rounds) {
  if (!rounds || rounds.length === 0) return null
  // Walk rounds in order; the last non-LOCKED round is the "current" one
  const nonLocked = rounds.filter((r) => r.status !== 'LOCKED')
  if (nonLocked.length === 0) return { round: rounds[0], label: 'Round 1 — Not Yet Started' }
  const last = nonLocked[nonLocked.length - 1]
  const scoreStr = last.score != null ? ` · Score: ${last.score}${last.max_score ? `/${last.max_score}` : ''}` : ''
  return {
    round: last,
    label: `Round ${last.round_number} — ${last.name ?? last.round_type}${scoreStr}`,
  }
}

// ── Candidate row ─────────────────────────────────────────────────────────────
function CandidateRow({ app, driveId, proposeState, onInitPropose, onCancelPropose, onSubmitPropose, onReasonChange }) {
  const ps = proposeState[app.application_id]
  const rounds = app.rounds ?? []
  const active = activeRoundSummary(rounds)

  return (
    <div className="candidate-row" style={{ alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>

      {/* Identity */}
      <div className="candidate-info" style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div>
          <strong>{app.student_name || 'Student'}</strong>
          <small>{app.roll_number} · {app.branch} · CGPA {app.cgpa}</small>
        </div>
        <AppBadge status={app.application_status} />
      </div>

      {/* Round progress */}
      <div style={{ flex: '2 1 220px', minWidth: 0 }}>
        {rounds.length === 0 ? (
          <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No round data yet</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {active && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#334258', fontWeight: 600 }}>{active.label}</span>
                <RoundChip status={active.round.status} />
              </div>
            )}
            {/* Mini round-by-round strip */}
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
              {rounds.map((r) => {
                const m = ROUND_STATUS_META[r.status] ?? ROUND_STATUS_META.LOCKED
                return (
                  <div
                    key={r.application_round_id ?? r.round_number}
                    title={`R${r.round_number} ${r.name ?? r.round_type}: ${r.status}${r.score != null ? ` (score: ${r.score})` : ''}`}
                    style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 12, fontWeight: 700,
                      color: m.color, background: m.bg, border: `1px solid ${m.color}40`,
                      cursor: 'default', userSelect: 'none',
                    }}
                  >
                    R{r.round_number}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Governance actions — ONLY for SHORTLISTED candidates */}
      <div style={{ flex: '0 0 auto', minWidth: 120 }}>
        {ps?.done ? (
          <span className="inline-success" style={{ fontSize: 12 }}>Proposal submitted ✓</span>
        ) : ps ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', minWidth: '240px' }}>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#334258' }}>
              Propose REMOVE — document reason:
            </div>
            <textarea
              rows={2}
              style={{ padding: '.5rem', border: '1px solid #cbd4dc', borderRadius: '6px', font: 'inherit', fontSize: '.85rem', resize: 'vertical' }}
              value={ps.reason}
              placeholder="Required: governance reason (min 5 chars)"
              onChange={(e) => onReasonChange(app.application_id, e.target.value)}
            />
            {ps.error && <span className="inline-error" style={{ fontSize: 12 }}>{ps.error}</span>}
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button
                className="secondary-button"
                style={{ fontSize: '.82rem', padding: '.45rem .8rem', color: '#dc2626', borderColor: '#dc2626' }}
                disabled={ps.busy || !ps.reason.trim()}
                onClick={() => onSubmitPropose(app, driveId)}
              >
                {ps.busy ? 'Submitting…' : 'Submit proposal'}
              </button>
              <button
                className="secondary-button"
                style={{ fontSize: '.82rem', padding: '.45rem .8rem' }}
                onClick={() => onCancelPropose(app.application_id)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          app.application_status === 'SHORTLISTED' ? (
            <button
              className="secondary-button"
              style={{ fontSize: '.82rem', padding: '.45rem .8rem', color: '#dc2626', borderColor: '#dc2626' }}
              onClick={() => onInitPropose(app.application_id)}
            >
              Propose REMOVE
            </button>
          ) : null
        )}
      </div>

    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function CoordinatorDashboard() {
  const { profile } = useAuth()
  const [drives, setDrives] = useState([])
  const [applicantsByDrive, setApplicantsByDrive] = useState({})  // driveId → applicant[]
  const [driveErrors, setDriveErrors] = useState({})              // driveId → error string
  const [loadingDrives, setLoadingDrives] = useState(true)
  const [loadingApplicants, setLoadingApplicants] = useState({}) // driveId → bool
  const [error, setError] = useState(null)
  const [proposeState, setProposeState] = useState({}) // appId → { busy, error, reason, done }
  const [expandedDrive, setExpandedDrive] = useState(null)

  // Load drive list on mount
  useEffect(() => {
    let live = true
    async function load() {
      try {
        const { drives: d } = await getDrivesWithEligibleCandidates()
        if (live) setDrives(d ?? [])
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoadingDrives(false)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  // Lazy-load applicants when a drive is expanded.
  // Always re-fetches after a prior error so the coordinator can retry.
  async function handleExpandDrive(driveId, forceRetry = false) {
    if (!forceRetry && expandedDrive === driveId) {
      setExpandedDrive(null)
      return
    }
    setExpandedDrive(driveId)
    // Skip re-fetch only if we have a successful (non-error) result already cached
    if (!forceRetry && applicantsByDrive[driveId] !== undefined && !driveErrors[driveId]) return
    setLoadingApplicants((p) => ({ ...p, [driveId]: true }))
    // Clear any previous error so the loading state shows cleanly
    setDriveErrors((p) => { const n = { ...p }; delete n[driveId]; return n })
    try {
      const data = await getDriveApplicants(driveId)
      setApplicantsByDrive((p) => ({ ...p, [driveId]: Array.isArray(data) ? data : [] }))
    } catch (err) {
      // Surface the real error — never silently swallow RPC failures
      setDriveErrors((p) => ({ ...p, [driveId]: err.message ?? 'Unknown error fetching applicants' }))
      // Remove any stale cached empty array so retry works
      setApplicantsByDrive((p) => { const n = { ...p }; delete n[driveId]; return n })
    } finally {
      setLoadingApplicants((p) => ({ ...p, [driveId]: false }))
    }
  }

  // Propose-state helpers
  const initPropose = (appId) =>
    setProposeState((p) => ({ ...p, [appId]: { busy: false, error: null, reason: '', done: false } }))

  const cancelPropose = (appId) =>
    setProposeState((p) => { const n = { ...p }; delete n[appId]; return n })

  const handleReasonChange = (appId, value) =>
    setProposeState((p) => ({ ...p, [appId]: { ...p[appId], reason: value } }))

  const submitPropose = async (app, driveId) => {
    const ps = proposeState[app.application_id]
    if (!ps || !ps.reason.trim()) return
    setProposeState((p) => ({ ...p, [app.application_id]: { ...ps, busy: true, error: null } }))
    try {
      await proposeShortlistChange(driveId, app.student_id, 'REMOVE', ps.reason.trim())
      setProposeState((p) => ({ ...p, [app.application_id]: { ...ps, busy: false, done: true } }))
    } catch (err) {
      setProposeState((p) => ({ ...p, [app.application_id]: { ...ps, busy: false, error: err.message } }))
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingDrives) return <div className="page-state">Loading drives…</div>

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">COORDINATOR PORTAL</span>
          <h2>Candidate Round Progress</h2>
          <p>
            Real-time view of every candidate&apos;s round progression across open drives.
            Assessment results and round advancement are determined by completed tests only.
            You may propose the removal of a shortlisted candidate — proposals require T&amp;P Head approval.
          </p>
        </div>
        <Link className="secondary-button" to="/coordinator/proposals">My proposals →</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {drives.length === 0 ? (
        <p className="empty-copy">No open drives at this time.</p>
      ) : (
        drives.map((drive) => {
          const isExpanded = expandedDrive === drive.id
          const applicants = applicantsByDrive[drive.id]  // undefined = not yet fetched
          const driveErr = driveErrors[drive.id]
          const isLoadingApps = loadingApplicants[drive.id]

          return (
            <div className="panel" key={drive.id} style={{ marginBottom: '1rem' }}>
              <div
                className="panel-heading"
                style={{ cursor: 'pointer' }}
                onClick={() => handleExpandDrive(drive.id)}
              >
                <div>
                  <span className="eyebrow">{drive.companies?.company_name ?? 'COMPANY'}</span>
                  <h3>{drive.title} — {drive.role_name}</h3>
                  <span style={{ fontSize: '.82rem', color: '#637089' }}>
                    Deadline: {new Date(drive.deadline).toLocaleString()}
                  </span>
                </div>
                <span className="secondary-button" style={{ fontSize: '.82rem', padding: '.4rem .75rem' }}>
                  {isExpanded ? 'Collapse ▲' : 'Show candidates ▼'}
                </span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '1rem' }}>
                  {isLoadingApps ? (
                    <div style={{ padding: '1rem', color: '#64748b', fontSize: 13 }}>
                      Loading candidate progress…
                    </div>
                  ) : driveErr ? (
                    /* ── Real error from RPC — show it, allow retry ── */
                    <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8 }}>
                      <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13, marginBottom: 6 }}>
                        ⚠ Could not load applicants
                      </div>
                      <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 10, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {driveErr}
                      </div>
                      <button
                        className="secondary-button"
                        style={{ fontSize: '.8rem', padding: '.35rem .7rem' }}
                        onClick={(e) => { e.stopPropagation(); handleExpandDrive(drive.id, true) }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : applicants === undefined || applicants.length === 0 ? (
                    <p className="empty-copy">No applications for this drive yet.</p>
                  ) : (
                    <>
                      <div style={{
                        display: 'flex', gap: '0.75rem', padding: '0.35rem 0.5rem 0.35rem 0.75rem',
                        fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
                        letterSpacing: 0.6, borderBottom: '1px solid #e2e8f0', marginBottom: '0.25rem',
                      }}>
                        <div style={{ flex: '1 1 180px' }}>Candidate</div>
                        <div style={{ flex: '2 1 220px' }}>Round Progress</div>
                        <div style={{ flex: '0 0 auto', minWidth: 120 }}>Actions</div>
                      </div>
                      {applicants.map((app) => (
                        <CandidateRow
                          key={app.application_id}
                          app={app}
                          driveId={drive.id}
                          proposeState={proposeState}
                          onInitPropose={initPropose}
                          onCancelPropose={cancelPropose}
                          onSubmitPropose={submitPropose}
                          onReasonChange={handleReasonChange}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
