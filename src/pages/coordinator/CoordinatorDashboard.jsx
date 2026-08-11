import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDrivesWithEligibleCandidates } from '../../services/drives'
import { proposeShortlistChange } from '../../services/placement'

export default function CoordinatorDashboard() {
  const { profile } = useAuth()
  const [drives, setDrives] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // propose state: { [appId]: { busy, error, reason, action, done } }
  const [proposeState, setProposeState] = useState({})
  const [expandedDrive, setExpandedDrive] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const { drives: d, applications: a } = await getDrivesWithEligibleCandidates()
        if (live) { setDrives(d); setApplications(a) }
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  const initPropose = (appId, action) => {
    setProposeState((p) => ({
      ...p,
      [appId]: { busy: false, error: null, reason: '', action, done: false },
    }))
  }

  const cancelPropose = (appId) => {
    setProposeState((p) => { const n = { ...p }; delete n[appId]; return n })
  }

  const submitPropose = async (app) => {
    const ps = proposeState[app.id]
    if (!ps || !ps.reason.trim()) return
    setProposeState((p) => ({ ...p, [app.id]: { ...ps, busy: true, error: null } }))
    try {
      await proposeShortlistChange(app.drive_id, app.student_id, ps.action, ps.reason.trim())
      setProposeState((p) => ({ ...p, [app.id]: { ...ps, busy: false, done: true } }))
    } catch (err) {
      setProposeState((p) => ({ ...p, [app.id]: { ...ps, busy: false, error: err.message } }))
    }
  }

  if (loading) return <div className="page-state">Loading candidate pool…</div>

  const appsByDrive = {}
  for (const app of applications) {
    if (!appsByDrive[app.drive_id]) appsByDrive[app.drive_id] = []
    appsByDrive[app.drive_id].push(app)
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">COORDINATOR PORTAL</span>
          <h2>Candidate Pool</h2>
          <p>Review eligible candidates across open drives and submit shortlist proposals. You cannot approve your own proposals.</p>
        </div>
        <Link className="secondary-button" to="/coordinator/proposals">My proposals →</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {drives.length === 0 ? (
        <p className="empty-copy">No open drives with candidates at this time.</p>
      ) : (
        drives.map((drive) => {
          const driveApps = appsByDrive[drive.id] ?? []
          const isExpanded = expandedDrive === drive.id
          return (
            <div className="panel" key={drive.id} style={{ marginBottom: '1rem' }}>
              <div
                className="panel-heading"
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedDrive(isExpanded ? null : drive.id)}
              >
                <div>
                  <span className="eyebrow">{drive.companies?.company_name || 'COMPANY'}</span>
                  <h3>{drive.title} — {drive.role_name}</h3>
                  <span style={{ fontSize: '.82rem', color: '#637089' }}>
                    Deadline: {new Date(drive.deadline).toLocaleString()} · {driveApps.length} application(s)
                  </span>
                </div>
                <span className="secondary-button" style={{ fontSize: '.82rem', padding: '.4rem .75rem' }}>
                  {isExpanded ? 'Collapse ▲' : 'Show candidates ▼'}
                </span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '1rem' }}>
                  {driveApps.length === 0 ? (
                    <p className="empty-copy">No applications for this drive yet.</p>
                  ) : (
                    driveApps.map((app) => {
                      const ps = proposeState[app.id]
                      const result = Array.isArray(app.eligibility_results)
                        ? app.eligibility_results[0]
                        : app.eligibility_results
                      const student = app.students
                      const eligible = result?.eligible === true

                      return (
                        <div className="candidate-row" key={app.id}>
                          <div className="candidate-info">
                            <div>
                              <strong>{student?.profiles?.name || 'Student'}</strong>
                              <small>
                                {student?.roll_number} · {student?.branch} · CGPA {student?.cgpa} · {student?.backlogs} backlog(s)
                              </small>
                              {!eligible && result?.failed_rules?.length > 0 && (
                                <p className="candidate-failed-rules">
                                  ✗ {result.failed_rules.join('; ')}
                                </p>
                              )}
                            </div>
                            <span className={`badge badge-${app.status}`}>{app.status}</span>
                            {eligible
                              ? <span className="badge badge-ELIGIBLE">Eligible</span>
                              : <span className="badge badge-INELIGIBLE">Ineligible</span>}
                          </div>

                          <div className="candidate-actions">
                            {ps?.done ? (
                              <span className="inline-success">Proposal submitted</span>
                            ) : ps ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', minWidth: '240px' }}>
                                <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#334258' }}>
                                  Propose {ps.action} — document reason:
                                </div>
                                <textarea
                                  rows={2}
                                  style={{ padding: '.5rem', border: '1px solid #cbd4dc', borderRadius: '6px', font: 'inherit', fontSize: '.85rem', resize: 'vertical' }}
                                  value={ps.reason}
                                  placeholder="Required: governance reason (min 5 chars)"
                                  onChange={(e) => setProposeState((p) => ({ ...p, [app.id]: { ...ps, reason: e.target.value } }))}
                                />
                                {ps.error && <span className="inline-error">{ps.error}</span>}
                                <div style={{ display: 'flex', gap: '.4rem' }}>
                                  <button className="primary-button" style={{ fontSize: '.82rem', padding: '.45rem .8rem' }} disabled={ps.busy || !ps.reason.trim()} onClick={() => submitPropose(app)}>
                                    {ps.busy ? 'Submitting…' : 'Submit proposal'}
                                  </button>
                                  <button className="secondary-button" style={{ fontSize: '.82rem', padding: '.45rem .8rem' }} onClick={() => cancelPropose(app.id)}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '.4rem' }}>
                                {eligible && (
                                  <button className="primary-button" style={{ fontSize: '.82rem', padding: '.45rem .8rem' }} onClick={() => initPropose(app.id, 'ADD')}>
                                    Propose ADD
                                  </button>
                                )}
                                {app.status === 'SHORTLISTED' && (
                                  <button className="secondary-button" style={{ fontSize: '.82rem', padding: '.45rem .8rem' }} onClick={() => initPropose(app.id, 'REMOVE')}>
                                    Propose REMOVE
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
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
