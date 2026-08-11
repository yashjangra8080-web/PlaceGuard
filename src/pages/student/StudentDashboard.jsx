import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStudentRecord, getOpenDrives, getStudentApplications } from '../../services/drives'
import { applyToDrive } from '../../services/placement'

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

  if (loading) return <div className="page-state">Loading available drives…</div>

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

                {drive.description && (
                  <p style={{ fontSize: '.85rem', color: '#637089', margin: 0 }}>{drive.description}</p>
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
