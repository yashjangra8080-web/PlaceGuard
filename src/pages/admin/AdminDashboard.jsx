import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getAllProfiles, updateProfileStatus, getMyAccessRequests, createAccessRequest } from '../../services/admin'

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toggling, setToggling] = useState({})
  const [showReqForm, setShowReqForm] = useState(false)
  const [reqForm, setReqForm] = useState({ resourceType: '', resourceId: '', reason: '' })
  const [reqBusy, setReqBusy] = useState(false)
  const [reqError, setReqError] = useState(null)
  const [reqSuccess, setReqSuccess] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [profileData, reqData] = await Promise.all([
        getAllProfiles(),
        getMyAccessRequests(profile.id),
      ])
      setProfiles(profileData)
      setRequests(reqData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let live = true
    loadAll().then(() => !live && undefined)
    return () => { live = false }
  }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (profileId, currentActive) => {
    setToggling((p) => ({ ...p, [profileId]: true }))
    try {
      await updateProfileStatus(profileId, !currentActive)
      setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, is_active: !currentActive } : p))
    } catch (err) {
      setError(err.message)
    } finally {
      setToggling((p) => ({ ...p, [profileId]: false }))
    }
  }

  const handleCreateRequest = async (e) => {
    e.preventDefault()
    setReqBusy(true)
    setReqError(null)
    setReqSuccess(false)
    try {
      await createAccessRequest({
        resourceType: reqForm.resourceType,
        resourceId: reqForm.resourceId || undefined,
        reason: reqForm.reason,
      })
      const created = await getMyAccessRequests(profile.id)
      setRequests(created)
      setReqForm({ resourceType: '', resourceId: '', reason: '' })
      setShowReqForm(false)
      setReqSuccess(true)
    } catch (err) {
      setReqError(err.message)
    } finally {
      setReqBusy(false)
    }
  }

  if (loading) return <div className="page-state"><div className="loading-spinner" /><span>Loading administration data…</span></div>

  const ROLE_LABELS = { student: 'Student', company: 'Company', coordinator: 'Coordinator', tnp_head: 'T&P Head', admin: 'Admin' }

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">ADMIN PORTAL</span>
          <h2>Controlled Administration</h2>
          <p>Sensitive access is auditable. Any data access must be requested with a documented reason.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Access Requests */}
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div className="section-header">
          <div>
            <span className="eyebrow">ACCESS REQUESTS</span>
            <h3>My access requests</h3>
          </div>
          <button className="secondary-button" onClick={() => { setShowReqForm((v) => !v); setReqSuccess(false) }}>
            {showReqForm ? 'Cancel' : '+ New request'}
          </button>
        </div>

        {reqSuccess && (
          <div className="alert success" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>
            Access request submitted and recorded in the audit trail.
          </div>
        )}

        {showReqForm && (
          <form onSubmit={handleCreateRequest} style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.75rem' }}>
              <div className="form-group">
                <label>Resource type *</label>
                <input required className="form-input" value={reqForm.resourceType} onChange={(e) => setReqForm((f) => ({ ...f, resourceType: e.target.value }))} placeholder="e.g. student_records, audit_log" />
              </div>
              <div className="form-group">
                <label>Resource ID <small>(optional UUID)</small></label>
                <input className="form-input" value={reqForm.resourceId} onChange={(e) => setReqForm((f) => ({ ...f, resourceId: e.target.value }))} placeholder="UUID of specific resource" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Reason * <small>(min 10 characters)</small></label>
                <textarea required className="form-textarea" minLength={10} rows={2} value={reqForm.reason} onChange={(e) => setReqForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Document why you need access to this resource" />
              </div>
            </div>
            {reqError && <div className="alert error" style={{ marginBottom: '.5rem' }}>{reqError}</div>}
            <button className="primary-button" type="submit" disabled={reqBusy}>{reqBusy ? 'Submitting…' : 'Submit request'}</button>
          </form>
        )}

        {requests.length === 0 ? (
          <p className="empty-copy">No access requests yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Resource type</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td>{req.resource_type}</td>
                  <td style={{ maxWidth: '300px', fontSize: '.82rem', color: 'var(--text-secondary)' }}>{req.reason}</td>
                  <td><span className={`badge badge-${req.status}`}>{req.status}</span></td>
                  <td style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>{new Date(req.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* User profiles */}
      <div className="panel">
        <div className="section-header">
          <div>
            <span className="eyebrow">USER MANAGEMENT</span>
            <h3>All profiles ({profiles.length})</h3>
          </div>
        </div>
        {profiles.length === 0 ? (
          <p className="empty-copy">No profiles found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td style={{ fontSize: '.85rem', color: 'var(--text-secondary)' }}>{p.email}</td>
                  <td><span className="badge badge-draft">{ROLE_LABELS[p.role] || p.role}</span></td>
                  <td>
                    <span className={`badge badge-${p.is_active ? 'APPROVED' : 'REJECTED'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>
                    {p.id !== profile.id ? (
                      <button
                        className="quiet-button"
                        style={{ color: p.is_active ? 'var(--danger)' : 'var(--success)', margin: 0, fontSize: '.82rem', padding: '.3rem .5rem', background: 'transparent', border: '1px solid currentColor', borderRadius: '6px' }}
                        disabled={toggling[p.id]}
                        onClick={() => handleToggle(p.id, p.is_active)}
                      >
                        {toggling[p.id] ? '…' : p.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>Your account</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
