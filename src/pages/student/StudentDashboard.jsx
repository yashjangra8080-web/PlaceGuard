import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStudentRecord, getOpenDrives, getStudentApplications } from '../../services/drives'
import { getMyApplicationRounds } from '../../services/rounds'
import { getAssessmentForRound } from '../../services/assessments'
import { applyToDrive } from '../../services/placement'

// ── Test Queue ────────────────────────────────────────────────────────────────
// Discovers all PENDING rounds across the student's applications and checks
// each for an active assessment. Shows a compact action bar if tests exist.
function TestQueue({ studentId }) {
  const navigate = useNavigate()
  const [items, setItems] = useState(null)   // null=loading

  useEffect(() => {
    let live = true
    async function load() {
      try {
        // Get applications
        const apps = await getStudentApplications(studentId)
        if (!live || !apps.length) { if (live) setItems([]); return }

        // For each app, fetch rounds, filter PENDING, check assessment
        const results = []
        await Promise.all(apps.map(async (app) => {
          try {
            const rounds = await getMyApplicationRounds(app.id)
            const pending = rounds.filter(r => r.status === 'PENDING')
            await Promise.all(pending.map(async (r) => {
              try {
                const asmt = await getAssessmentForRound(r.round_id)
                if (!asmt || !asmt.is_active) return
                results.push({
                  roundId: r.round_id,
                  roundName: r.name,
                  driveName: app.drives?.title || '—',
                  companyName: app.drives?.companies?.company_name || '—',
                  assessmentId: asmt.assessment_id,
                  durationMinutes: asmt.duration_minutes,
                  totalQuestions: asmt.total_questions,
                  existingStatus: asmt.existing_attempt_status,
                  existingAttemptId: asmt.existing_attempt_id,
                  resultId: asmt.result_id,
                })
              } catch { /* skip */ }
            }))
          } catch { /* skip */ }
        }))

        if (live) setItems(results)
      } catch {
        if (live) setItems([])
      }
    }
    load()
    return () => { live = false }
  }, [studentId])

  if (items === null) return null   // silent loading — don't distract from main page
  if (items.length === 0) return null

  return (
    <div className="panel" style={{ marginBottom: '1.5rem', border: '1.5px solid #4f46e5', background: '#eef2ff' }}>
      <div className="panel-heading">
        <div>
          <h3 style={{ color: '#3730a3', marginBottom: 2 }}>📝 Tests Ready to Take</h3>
          <p style={{ fontSize: 12.5, color: '#4f46e5', margin: 0 }}>
            You have {items.length} active assessment{items.length !== 1 ? 's' : ''} waiting.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {items.map((item, i) => {
          const isInProgress = item.existingStatus === 'IN_PROGRESS'
          const isSubmitted  = item.existingStatus === 'SUBMITTED'

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              background: 'white', border: '1px solid #c7d2fe', borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1e1b4b' }}>{item.roundName}</div>
                <div style={{ fontSize: 12, color: '#4f46e5', marginTop: 2 }}>
                  {item.companyName} · {item.driveName}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  {item.durationMinutes} min · {item.totalQuestions} questions
                </div>
              </div>

              {isSubmitted && item.resultId ? (
                <Link
                  to={`/student/test/${item.assessmentId}/result/${item.existingAttemptId}`}
                  className="secondary-button btn-sm"
                  style={{ fontSize: 12 }}
                >
                  📊 View Result
                </Link>
              ) : isInProgress ? (
                <button
                  className="primary-button btn-sm"
                  style={{ background: '#d97706', fontSize: 13 }}
                  onClick={() => navigate(`/student/test/${item.assessmentId}`)}
                >
                  ▶ Resume Test
                </button>
              ) : (
                <button
                  className="primary-button btn-sm"
                  style={{ background: '#059669', fontSize: 13, fontWeight: 700 }}
                  onClick={() => navigate(`/student/test/${item.assessmentId}`)}
                >
                  📝 Start Test →
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { profile } = useAuth()
  const [student, setStudent] = useState(null)
  const [drives, setDrives] = useState([])
  const [appliedIds, setAppliedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [applying, setApplying] = useState({})
  const [applyResult, setApplyResult] = useState({})

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const studentRecord = await getStudentRecord(profile.id)
      const [drivesData, apps] = await Promise.all([
        getOpenDrives(),
        studentRecord ? getStudentApplications(studentRecord.id) : Promise.resolve([]),
      ])
      setStudent(studentRecord)
      setDrives(drivesData)
      setAppliedIds(new Set(apps.map((a) => a.drive_id)))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let live = true
    load().then(() => !live && undefined)
    return () => { live = false }
  }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = async (driveId) => {
    setApplying((p) => ({ ...p, [driveId]: true }))
    setApplyResult((p) => ({ ...p, [driveId]: null }))
    try {
      await applyToDrive(driveId)
      setAppliedIds((prev) => new Set([...prev, driveId]))
      setApplyResult((p) => ({ ...p, [driveId]: { ok: true } }))
    } catch (err) {
      setApplyResult((p) => ({ ...p, [driveId]: { ok: false, message: err.message } }))
    } finally {
      setApplying((p) => ({ ...p, [driveId]: false }))
    }
  }

  if (loading) return (
    <div className="page-state">
      <div className="loading-spinner" />
      <span>Loading available drives…</span>
    </div>
  )

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">STUDENT PORTAL</span>
          <h2>Open Placement Drives</h2>
          <p>Eligibility is verified server-side the moment you apply.</p>
        </div>
        <Link className="secondary-button" to="/student/applications">My applications →</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!student && !error && (
        <div className="alert warning" style={{ marginBottom: '1rem' }}>
          Your student profile has not been configured. Contact the placement office to set up your student record before applying.
        </div>
      )}

      {/* Test queue — only rendered when student record exists */}
      {student && <TestQueue studentId={student.id} />}

      {drives.length === 0 ? (
        <p className="empty-copy">No open placement drives are available right now.</p>
      ) : (
        <div className="drive-grid">
          {drives.map((drive) => {
            const rules = Array.isArray(drive.eligibility_rules)
              ? drive.eligibility_rules[0]
              : drive.eligibility_rules
            const alreadyApplied = appliedIds.has(drive.id)
            const result = applyResult[drive.id]
            const isPast = new Date(drive.deadline) <= new Date()

            return (
              <article className="drive-card" key={drive.id}>
                <div className="drive-card-header">
                  <div>
                    <span className="eyebrow">{drive.companies?.company_name || '—'}</span>
                    <h3>{drive.title}</h3>
                    <p>{drive.role_name}</p>
                  </div>
                  <span className={`badge badge-${drive.status}`}>{drive.status}</span>
                </div>

                {rules && (
                  <dl className="eligibility-summary">
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
                )}

                {/* Recruitment pipeline */}
                {Array.isArray(drive.drive_rounds) && drive.drive_rounds.length > 0 && (
                  <div className="round-pipeline">
                    <span className="round-pipeline-label">Recruitment rounds:</span>
                    <div className="round-pipeline-track">
                      {[...drive.drive_rounds]
                        .sort((a, b) => a.round_number - b.round_number)
                        .map((r, i, arr) => (
                          <span key={r.round_number} className="round-pipeline-step">
                            <span className="round-pipeline-num">{r.round_number}</span>
                            <span className="round-pipeline-name">{r.name}</span>
                            {i < arr.length - 1 && <span className="round-pipeline-arrow">→</span>}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {drive.description && (
                  <p style={{ fontSize: '.85rem', color: '#637089', margin: '.5rem 0 0' }}>{drive.description}</p>
                )}

                <div className="drive-card-footer">
                  <small className={isPast ? 'text-danger' : ''}>
                    Deadline: {new Date(drive.deadline).toLocaleString()}
                    {isPast && ' (closed)'}
                  </small>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.3rem' }}>
                    {result && !result.ok && (
                      <span className="inline-error">{result.message}</span>
                    )}
                    {result && result.ok && (
                      <span className="inline-success">Application submitted!</span>
                    )}
                    {alreadyApplied ? (
                      <span className="badge badge-APPLIED">Applied</span>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={!student || applying[drive.id] || isPast}
                        onClick={() => handleApply(drive.id)}
                      >
                        {applying[drive.id] ? 'Applying…' : 'Apply'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
