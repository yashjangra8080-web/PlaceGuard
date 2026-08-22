import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStudentRecord, getOpenDrives, getStudentApplications } from '../../services/drives'
import { getMyApplicationRounds } from '../../services/rounds'
import { getAssessmentForRound } from '../../services/assessments'
import { applyToDrive } from '../../services/placement'

// -- Test Queue -----------------------------------------------------------------
// Discovers all PENDING rounds across the student's applications and shows
// a compact action bar if active assessments exist.
function TestQueue({ studentId }) {
  const navigate = useNavigate()
  const [items, setItems] = useState(null)   // null=loading

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const apps = await getStudentApplications(studentId)
        if (!live || !apps.length) { if (live) setItems([]); return }

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
                  driveName: app.drives?.title || '�',
                  companyName: app.drives?.companies?.company_name || '�',
                  assessmentId: asmt.assessment_id,
                  durationMinutes: asmt.duration_minutes,
                  totalQuestions: asmt.total_questions,
                  existingStatus: asmt.existing_attempt_status,
                  existingAttemptId: asmt.existing_attempt_id,
                  resultId: asmt.result_id,
                })
              } catch { /* skip individual round errors */ }
            }))
          } catch { /* skip individual app errors */ }
        }))

        if (live) setItems(results)
      } catch {
        if (live) setItems([])
      }
    }
    load()
    return () => { live = false }
  }, [studentId])

  if (items === null) return null   // silent loading
  if (items.length === 0) return null

  return (
    <div className="test-queue-panel">
      <div className="test-queue-heading">
        <div className="test-queue-title">Tests Ready to Take</div>
        <span className="test-queue-count">{items.length} active</span>
      </div>
      {items.map((item, i) => {
        const isInProgress = item.existingStatus === 'IN_PROGRESS'
        const isSubmitted  = item.existingStatus === 'SUBMITTED'

        return (
          <div key={i} className="test-queue-item">
            <div className="test-queue-info">
              <div className="test-queue-round">{item.roundName}</div>
              <div className="test-queue-meta">
                {item.companyName} &middot; {item.driveName} &middot; {item.durationMinutes} min &middot; {item.totalQuestions} questions
              </div>
            </div>

            {isSubmitted && item.resultId ? (
              <Link
                to={`/student/test/${item.assessmentId}/result/${item.existingAttemptId}`}
                className="secondary-button btn-sm"
              >
                View Result
              </Link>
            ) : isInProgress ? (
              <button
                className="primary-button btn-sm"
                style={{ background: 'var(--warning)' }}
                onClick={() => navigate(`/student/test/${item.assessmentId}`)}
              >
                Resume Test
              </button>
            ) : (
              <button
                className="primary-button btn-sm"
                style={{ background: 'var(--success)' }}
                onClick={() => navigate(`/student/test/${item.assessmentId}`)}
              >
                Start Test
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// -- Main Dashboard -------------------------------------------------------------
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
      <span>Loading available drives...</span>
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
        <Link className="secondary-button" to="/student/applications">My applications</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!student && !error && (
        <div className="alert warning" style={{ marginBottom: '1rem' }}>
          Your student profile has not been configured. Contact the placement office to set up your student record before applying.
        </div>
      )}

      {/* Test queue � only rendered when student record exists */}
      {student && <TestQueue studentId={student.id} />}

      {/* How placement works � brief pipeline for new students */}
      {drives.length > 0 && (
        <div className="student-pipeline-strip">
          <div className="student-pipeline-label">How placement works</div>
          <div className="pipeline-track">
            {['Apply', 'Eligibility', 'Assessment', 'Round 2+', 'Interview', 'Selection'].map((step, i) => (
              <div key={step} className="pipeline-step">
                {i > 0 && <div />}
                <div className="pipeline-circle">{i + 1}</div>
                <div className="pipeline-label">{step}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {drives.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#x1F4CB;</div>
          <div className="empty-state-title">No open drives right now</div>
          <p className="empty-state-sub">Check back soon � placement drives will appear here when companies publish them.</p>
        </div>
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
              <article
                className={`drive-card ${alreadyApplied ? 'drive-card-active-round' : ''}`}
                key={drive.id}
              >
                <div className="drive-card-header">
                  <div>
                    <span className="eyebrow">{drive.companies?.company_name || '�'}</span>
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
                    <span className="round-pipeline-label">Rounds:</span>
                    <div className="round-pipeline-track">
                      {[...drive.drive_rounds]
                        .sort((a, b) => a.round_number - b.round_number)
                        .map((r, i, arr) => (
                          <span key={r.round_number} className="round-pipeline-step">
                            <span className="round-pipeline-num">{r.round_number}</span>
                            <span className="round-pipeline-name">{r.name}</span>
                            {i < arr.length - 1 && <span className="round-pipeline-arrow">&#x2192;</span>}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {drive.description && (
                  <p style={{ fontSize: '.85rem', color: 'var(--text-secondary)', margin: '.5rem 0 0' }}>{drive.description}</p>
                )}

                <div className="drive-card-footer">
                  <small className={isPast ? 'text-danger' : 'text-muted'}>
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
                        {applying[drive.id] ? 'Applying...' : 'Apply'}
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
