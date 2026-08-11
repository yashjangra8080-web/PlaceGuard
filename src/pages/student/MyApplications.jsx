import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStudentRecord, getStudentApplications } from '../../services/drives'

const STATUS_LABELS = {
  APPLIED: 'Applied',
  ELIGIBLE: 'Eligible',
  INELIGIBLE: 'Ineligible',
  SHORTLISTED: 'Shortlisted',
  REJECTED: 'Rejected',
  SELECTED: 'Selected',
}

export default function MyApplications() {
  const { profile } = useAuth()
  const [applications, setApplications] = useState([])
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

  if (loading) return <div className="page-state">Loading your applications…</div>

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">STUDENT PORTAL</span>
          <h2>My Applications</h2>
          <p>Your placement application history and eligibility results.</p>
        </div>
        <Link className="secondary-button" to="/student">← Open drives</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!error && applications.length === 0 ? (
        <p className="empty-copy">You have not applied to any drives yet. <Link to="/student">Browse open drives →</Link></p>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Drive</th>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Eligibility</th>
                <th>Applied</th>
                <th>Deadline</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const result = Array.isArray(app.eligibility_results)
                  ? app.eligibility_results[0]
                  : app.eligibility_results
                return (
                  <tr key={app.id}>
                    <td><strong>{app.drives?.title || '—'}</strong></td>
                    <td>{app.drives?.companies?.company_name || '—'}</td>
                    <td>{app.drives?.role_name || '—'}</td>
                    <td>
                      <span className={`badge badge-${app.status}`}>
                        {STATUS_LABELS[app.status] || app.status}
                      </span>
                    </td>
                    <td>
                      {result ? (
                        result.eligible ? (
                          <span className="badge badge-ELIGIBLE">Eligible</span>
                        ) : (
                          <details>
                            <summary className="badge badge-INELIGIBLE" style={{ cursor: 'pointer' }}>Ineligible</summary>
                            <ul style={{ margin: '.5rem 0 0 1rem', fontSize: '.8rem', color: '#9c2f2a' }}>
                              {(result.failed_rules ?? []).map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                          </details>
                        )
                      ) : (
                        <span style={{ color: '#637089', fontSize: '.82rem' }}>Pending</span>
                      )}
                    </td>
                    <td style={{ fontSize: '.82rem', color: '#637089' }}>
                      {new Date(app.applied_at).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '.82rem', color: '#637089' }}>
                      {app.drives?.deadline ? new Date(app.drives.deadline).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
