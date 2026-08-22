import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getCompanyRecord, getCompanyDrives } from '../../services/drives'
import { getDriveApplicants } from '../../services/rounds'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Use existing capitalized .badge-STATUS classes defined in CSS
const APP_STATUS_BADGE = {
  APPLIED:     'badge-APPLIED',
  ELIGIBLE:    'badge-ELIGIBLE',
  INELIGIBLE:  'badge-INELIGIBLE',
  SHORTLISTED: 'badge-SHORTLISTED',
  SELECTED:    'badge-SELECTED',
  REJECTED:    'badge-REJECTED',
}

const ROUND_STATUS_BADGE = {
  LOCKED:  'badge-LOCKED',
  PENDING: 'badge-PENDING',
  PASSED:  'badge-PASSED',
  FAILED:  'badge-FAILED',
  ABSENT:  'badge-ABSENT',
}

const APP_STATUS_LABEL = {
  APPLIED:     'Applied',
  ELIGIBLE:    'Eligible',
  INELIGIBLE:  'Ineligible',
  SHORTLISTED: 'Shortlisted',
  SELECTED:    'Selected',
  REJECTED:    'Rejected',
}

const ROUND_STATUS_LABEL = {
  LOCKED:  'Locked',
  PENDING: 'Pending',
  PASSED:  'Passed',
  FAILED:  'Failed',
  ABSENT:  'Absent',
}

export default function CompanyCandidates() {
  const { profile } = useAuth()
  const [drives,     setDrives]     = useState([])
  const [selectedDrive, setSelectedDrive] = useState(null)
  const [candidates, setCandidates] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [cLoading,   setCLoading]   = useState(false)
  const [error,      setError]      = useState(null)
  const [search,     setSearch]     = useState('')

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const company = await getCompanyRecord(profile.id)
        if (!company) { if (live) setLoading(false); return }
        const driveList = await getCompanyDrives(company.id)
        if (!live) return
        setDrives(driveList)
        if (driveList.length > 0) setSelectedDrive(driveList[0].id)
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  useEffect(() => {
    if (!selectedDrive) return
    let live = true
    setCandidates(null)
    setCLoading(true)
    getDriveApplicants(selectedDrive)
      .then(d => { if (live) setCandidates(d) })
      .catch(err => { if (live) setError(err.message) })
      .finally(() => { if (live) setCLoading(false) })
    return () => { live = false }
  }, [selectedDrive])

  const filtered = candidates
    ? candidates.filter(c =>
        !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  if (loading) return <div className="page-state"><div className="loading-spinner" /><span>Loading…</span></div>

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">RECRUITER PORTAL</span>
          <h2>Candidates</h2>
          <p>Track applicant progress across all recruitment rounds.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Drive selector + search */}
      {drives.length > 0 && (
        <div style={{ marginBottom: '1.25rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            value={selectedDrive ?? ''}
            onChange={e => setSelectedDrive(e.target.value)}
            style={{ minWidth: 200 }}
          >
            {drives.map(d => (
              <option key={d.id} value={d.id}>{d.title} ({d.role_name})</option>
            ))}
          </select>
          <input
            type="text"
            className="form-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{ minWidth: 220 }}
          />
        </div>
      )}

      {drives.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No drives yet</div>
          <div className="empty-state-sub">Create a placement drive to start seeing candidates.</div>
        </div>
      ) : cLoading ? (
        <div className="page-state"><div className="loading-spinner" /><span>Loading candidates…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No candidates found</div>
          <div className="empty-state-sub">
            {search ? 'No candidates match your search.' : 'No applications yet for this drive.'}
          </div>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Status</th>
                <th>Current Round</th>
                <th>Round Status</th>
                <th>Score</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.application_id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.email}</div>
                  </td>
                  <td>
                    <span className={`badge ${APP_STATUS_BADGE[c.application_status] ?? 'badge-slate'}`}>
                      {c.application_status ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      {c.current_round_name ?? 'Not started'}
                    </span>
                  </td>
                  <td>
                    {c.current_round_status && (
                      <span className={`badge ${ROUND_STATUS_BADGE[c.current_round_status] ?? 'badge-slate'}`}>
                        {c.current_round_status ?? "—"}
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {c.current_round_score != null ? c.current_round_score : '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{fmt(c.applied_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0', textAlign: 'right' }}>
            {filtered.length} candidate{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </section>
  )
}
