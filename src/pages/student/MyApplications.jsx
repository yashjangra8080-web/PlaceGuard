import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStudentRecord, getStudentApplications } from '../../services/drives'
import { getMyApplicationRounds } from '../../services/rounds'
import { getAssessmentForRound } from '../../services/assessments'

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  APPLIED:     'Applied',
  ELIGIBLE:    'Eligible',
  INELIGIBLE:  'Ineligible',
  SHORTLISTED: 'Shortlisted',
  REJECTED:    'Rejected',
  SELECTED:    'Selected',
}

// Dark-theme safe backgrounds — subtle tint only
const STATUS_BG = {
  SELECTED:    'rgba(16,185,129,0.06)',
  REJECTED:    'rgba(244,63,94,0.06)',
  SHORTLISTED: 'rgba(99,102,241,0.06)',
  ELIGIBLE:    'transparent',
  APPLIED:     'transparent',
  INELIGIBLE:  'rgba(244,63,94,0.04)',
}

const ROUND_TYPE_LABELS = {
  APTITUDE: 'Aptitude', CODING: 'Coding',
  SQL_ASSESSMENT: 'SQL/Python', LINUX_ASSESSMENT: 'Linux',
  CLOUD_ASSESSMENT: 'Cloud', TECHNICAL_INTERVIEW: 'Tech Interview',
  HR_INTERVIEW: 'HR Interview', GROUP_DISCUSSION: 'GD', ASSESSMENT: 'Assessment',
}

// Dark-theme status colours using CSS variables
const ROUND_STATUS_CONFIG = {
  LOCKED:  { label: 'Locked',   color: 'var(--text-tertiary)' },
  PENDING: { label: 'Active',   color: 'var(--info)' },
  PASSED:  { label: 'Passed',   color: 'var(--success)' },
  FAILED:  { label: 'Failed',   color: 'var(--danger)' },
  ABSENT:  { label: 'Absent',   color: 'var(--warning)' },
}

// ── AssessmentButton ──────────────────────────────────────────────────────────
function AssessmentButton({ roundId }) {
  const navigate = useNavigate()
  const [state, setState] = useState(null)

  useEffect(() => {
    let live = true
    getAssessmentForRound(roundId)
      .then(d => { if (live) setState(d ?? false) })
      .catch(() => { if (live) setState(false) })
    return () => { live = false }
  }, [roundId])

  if (state === null) return (
    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Checking…</span>
  )
  if (state === false || !state.assessment_id) return null
  if (!state.is_active) return (
    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Test not active yet</span>
  )

  const { assessment_id, existing_attempt_status, existing_attempt_id, result_id } = state

  if (existing_attempt_status === 'SUBMITTED' && result_id) {
    return (
      <Link
        to={`/student/test/${assessment_id}/result/${existing_attempt_id}`}
        className="secondary-button btn-sm"
        style={{ fontSize: 12 }}
      >
        View Result
      </Link>
    )
  }

  if (existing_attempt_status === 'IN_PROGRESS') {
    return (
      <button
        className="primary-button btn-sm"
        style={{ fontSize: 12, background: 'var(--warning)' }}
        onClick={() => navigate(`/student/test/${assessment_id}`)}
      >
        Resume Test
      </button>
    )
  }

  return (
    <button
      className="primary-button btn-sm"
      style={{ fontSize: 12, background: 'var(--success)' }}
      onClick={() => navigate(`/student/test/${assessment_id}`)}
    >
      Start Test
    </button>
  )
}

// ── Round list with assessment buttons ────────────────────────────────────────
function RoundList({ rounds, loading }) {
  if (loading && rounds.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading rounds…</p>
  }
  if (rounds.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No rounds configured yet.</p>
  }

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rounds.map(r => {
        const cfg = ROUND_STATUS_CONFIG[r.status] ?? ROUND_STATUS_CONFIG.LOCKED
        const isPending = r.status === 'PENDING'

        return (
          <li
            key={r.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px',
              background: isPending ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isPending ? 'rgba(56,189,248,0.18)' : 'var(--card-border)'}`,
              borderRadius: 10,
              flexWrap: 'wrap',
            }}
          >
            {/* Round number badge */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: cfg.color + '22', color: cfg.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800,
            }}>
              {r.round_number}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {r.name}
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 8, color: 'var(--text-secondary)' }}>
                  {ROUND_TYPE_LABELS[r.round_type] ?? r.round_type}
                </span>
                {r.is_elimination && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', marginLeft: 6, background: 'var(--danger-bg)', padding: '1px 6px', borderRadius: 4 }}>
                    Elim
                  </span>
                )}
              </div>
              {r.score != null && (
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Score: <strong style={{ color: 'var(--text-primary)' }}>{r.score}</strong>
                  {r.max_score != null ? `/${r.max_score}` : ''}
                  {r.passing_score != null && ` · Pass: ${r.passing_score}`}
                </div>
              )}
              {r.feedback && (
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>
                  {r.feedback}
                </div>
              )}
            </div>

            {/* Status chip */}
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              color: cfg.color, background: cfg.color + '18',
            }}>
              {cfg.label}
            </span>

            {/* Assessment CTA — only for PENDING rounds */}
            {isPending && (
              <AssessmentButton roundId={r.round_id} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MyApplications() {
  const { profile } = useAuth()
  const [applications, setApplications] = useState([])
  const [roundsMap, setRoundsMap] = useState({})
  const [roundsLoadingMap, setRoundsLoadingMap] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const student = await getStudentRecord(profile.id)
        if (!student) {
          if (live) { setApplications([]); setLoading(false) }
          return
        }
        const data = await getStudentApplications(student.id)
        if (live) setApplications(data)
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  const toggleExpand = useCallback(async (appId) => {
    if (expandedId === appId) { setExpandedId(null); return }
    setExpandedId(appId)
    if (roundsMap[appId]) return
    setRoundsLoadingMap(p => ({ ...p, [appId]: true }))
    try {
      const rounds = await getMyApplicationRounds(appId)
      setRoundsMap(p => ({ ...p, [appId]: rounds }))
    } catch (err) {
      setError(err.message || 'Failed to load rounds. Please try again.')
      setRoundsMap(p => ({ ...p, [appId]: [] }))
    } finally {
      setRoundsLoadingMap(p => ({ ...p, [appId]: false }))
    }
  }, [expandedId, roundsMap])

  if (loading) return (
    <div className="page-state">
      <div className="loading-spinner" />
      <span>Loading your applications…</span>
    </div>
  )

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">STUDENT PORTAL</span>
          <h2>My Applications</h2>
          <p>Your placement applications and round-by-round progress.</p>
        </div>
        <Link className="secondary-button" to="/student">Browse drives</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!error && applications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No applications yet</div>
          <p className="empty-state-sub">Apply to a placement drive to see your applications here.</p>
          <Link to="/student" className="primary-button" style={{ marginTop: 16 }}>Browse drives</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {applications.map((app) => {
            const result = Array.isArray(app.eligibility_results)
              ? app.eligibility_results[0]
              : app.eligibility_results
            const isExpanded = expandedId === app.id
            const rounds = roundsMap[app.id] ?? []
            const roundsLoading = roundsLoadingMap[app.id] ?? false
            const bg = STATUS_BG[app.status] ?? 'transparent'
            const activeRound = rounds.find(r => r.status === 'PENDING')
            const passedCount = rounds.filter(r => r.status === 'PASSED').length

            return (
              <article
                key={app.id}
                className="panel"
                style={{ background: bg, transition: 'background .2s' }}
              >
                {/* Header */}
                <div className="panel-heading" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <span className="eyebrow">
                      {app.drives?.companies?.company_name || '—'}
                    </span>
                    <h3 style={{ marginBottom: '.2rem' }}>{app.drives?.title || '—'}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '.85rem', margin: 0 }}>
                      {app.drives?.role_name || '—'} · Applied {new Date(app.applied_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.4rem' }}>
                    <span className={`badge badge-${app.status}`}>
                      {STATUS_LABELS[app.status] || app.status}
                    </span>
                    {result && (
                      result.eligible
                        ? <span className="badge badge-ELIGIBLE" style={{ fontSize: '.75rem' }}>Eligible</span>
                        : (
                          <details style={{ textAlign: 'right' }}>
                            <summary className="badge badge-INELIGIBLE" style={{ cursor: 'pointer', fontSize: '.75rem' }}>Ineligible</summary>
                            <ul style={{ margin: '.4rem 0 0 1rem', fontSize: '.78rem', color: 'var(--danger)', textAlign: 'left' }}>
                              {(result.failed_rules ?? []).map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                          </details>
                        )
                    )}
                  </div>
                </div>

                {/* Round summary bar */}
                {app.status !== 'INELIGIBLE' && (
                  <div style={{ marginTop: '.65rem', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
                    {activeRound ? (
                      <span style={{ fontSize: '.82rem', color: 'var(--info)', fontWeight: 600 }}>
                        Current round: {activeRound.name}
                      </span>
                    ) : app.status === 'SELECTED' ? (
                      <span style={{ fontSize: '.82rem', color: 'var(--success)', fontWeight: 600 }}>Selected!</span>
                    ) : app.status === 'REJECTED' ? (
                      <span style={{ fontSize: '.82rem', color: 'var(--danger)', fontWeight: 600 }}>
                        Rejected after {passedCount} round{passedCount !== 1 ? 's' : ''}
                      </span>
                    ) : rounds.length > 0 ? (
                      <span style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>Rounds pending evaluation</span>
                    ) : null}

                    <button
                      className="secondary-button"
                      style={{ fontSize: '.8rem', padding: '.3rem .75rem', marginLeft: 'auto' }}
                      onClick={() => toggleExpand(app.id)}
                    >
                      {isExpanded ? 'Hide rounds' : 'View rounds'}
                    </button>
                  </div>
                )}

                {/* Expanded round list */}
                {isExpanded && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}>
                    <RoundList rounds={rounds} loading={roundsLoading} />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
