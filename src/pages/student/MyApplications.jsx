import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStudentRecord, getStudentApplications } from '../../services/drives'
import { getMyApplicationRounds } from '../../services/rounds'
import RoundProgressList from '../../components/rounds/RoundProgressList'

const STATUS_LABELS = {
  APPLIED:     'Applied',
  ELIGIBLE:    'Eligible',
  INELIGIBLE:  'Ineligible',
  SHORTLISTED: 'Shortlisted',
  REJECTED:    'Rejected',
  SELECTED:    'Selected',
}

const STATUS_BG = {
  SELECTED:    '#f0fdf4',
  REJECTED:    '#fff1f0',
  SHORTLISTED: '#eff6ff',
  ELIGIBLE:    '#f8fafc',
  APPLIED:     '#f8fafc',
  INELIGIBLE:  '#fff8f8',
}

export default function MyApplications() {
  const { profile } = useAuth()
  const [applications, setApplications] = useState([])
  const [roundsMap, setRoundsMap] = useState({}) // appId → rounds[]
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [roundsLoading, setRoundsLoading] = useState(false)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const student = await getStudentRecord(profile.id)
        if (!student) { if (live) { setApplications([]); setLoading(false) } ; return }
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

  const toggleExpand = async (appId) => {
    if (expandedId === appId) { setExpandedId(null); return }
    setExpandedId(appId)
    if (roundsMap[appId]) return // already loaded
    setRoundsLoading(true)
    try {
      const rounds = await getMyApplicationRounds(appId)
      setRoundsMap((prev) => ({ ...prev, [appId]: rounds }))
    } catch {
      setRoundsMap((prev) => ({ ...prev, [appId]: [] }))
    } finally {
      setRoundsLoading(false)
    }
  }

  if (loading) return <div className="page-state">Loading your applications…</div>

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">STUDENT PORTAL</span>
          <h2>My Applications</h2>
          <p>Your placement application history, eligibility results and round-by-round progress.</p>
        </div>
        <Link className="secondary-button" to="/student">← Open drives</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!error && applications.length === 0 ? (
        <p className="empty-copy">
          You have not applied to any drives yet.{' '}
          <Link to="/student">Browse open drives →</Link>
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {applications.map((app) => {
            const result = Array.isArray(app.eligibility_results)
              ? app.eligibility_results[0]
              : app.eligibility_results
            const isExpanded = expandedId === app.id
            const rounds = roundsMap[app.id] ?? []
            const bg = STATUS_BG[app.status] ?? '#f8fafc'
            const activeRound = rounds.find((r) => r.status === 'PENDING')
            const passedCount = rounds.filter((r) => r.status === 'PASSED').length

            return (
              <article
                key={app.id}
                className="panel"
                style={{ background: bg, transition: 'background .2s' }}
              >
                {/* Header row */}
                <div className="panel-heading" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <span className="eyebrow">
                      {app.drives?.companies?.company_name || '—'}
                    </span>
                    <h3 style={{ marginBottom: '.2rem' }}>{app.drives?.title || '—'}</h3>
                    <p style={{ color: '#637089', fontSize: '.85rem', margin: 0 }}>
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
                            <ul style={{ margin: '.4rem 0 0 1rem', fontSize: '.78rem', color: '#9c2f2a', textAlign: 'left' }}>
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
                      <span style={{ fontSize: '.82rem', color: '#0369a1', fontWeight: 600 }}>
                        ⏳ Current round: {activeRound.name}
                      </span>
                    ) : app.status === 'SELECTED' ? (
                      <span style={{ fontSize: '.82rem', color: '#146647', fontWeight: 600 }}>
                        🎉 Selected!
                      </span>
                    ) : app.status === 'REJECTED' ? (
                      <span style={{ fontSize: '.82rem', color: '#a3322c', fontWeight: 600 }}>
                        Rejected after {passedCount} round{passedCount !== 1 ? 's' : ''}
                      </span>
                    ) : rounds.length > 0 ? (
                      <span style={{ fontSize: '.82rem', color: '#637089' }}>
                        Rounds pending evaluation
                      </span>
                    ) : null}

                    <button
                      className="secondary-button"
                      style={{ fontSize: '.8rem', padding: '.3rem .75rem', marginLeft: 'auto' }}
                      onClick={() => toggleExpand(app.id)}
                    >
                      {isExpanded ? 'Hide rounds ▲' : 'View rounds ▼'}
                    </button>
                  </div>
                )}

                {/* Expanded round progress */}
                {isExpanded && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                    {roundsLoading && !rounds.length
                      ? <p style={{ color: '#637089', fontSize: '.85rem' }}>Loading rounds…</p>
                      : <RoundProgressList rounds={rounds} studentView={true} />
                    }
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
