import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { requestAdminChange, getMyChangeRequests } from '../../services/assessments'

const ENTITY_TYPES = ['drive', 'eligibility_rule', 'drive_round', 'assessment', 'application', 'shortlist']
const ACTIONS = [
  'UPDATE_ELIGIBILITY', 'CHANGE_ROUND_CONFIG', 'OVERRIDE_RESULT',
  'EXTEND_DEADLINE', 'MODIFY_SHORTLIST', 'REOPEN_DRIVE', 'OTHER',
]
const STATUS_COLORS = {
  PENDING_TNP_APPROVAL: { bg: '#fef3c7', color: '#92400e', label: 'Awaiting T&P Approval' },
  APPROVED: { bg: '#d1fae5', color: '#065f46', label: 'Approved' },
  REJECTED: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  WITHDRAWN: { bg: '#f1f5f9', color: '#64748b', label: 'Withdrawn' },
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminChangeRequests() {
  useAuth()
  const [form, setForm] = useState({
    entityType: 'drive', entityId: '', action: 'UPDATE_ELIGIBILITY',
    oldValue: '', newValue: '', reason: '',
  })
  const [myRequests, setMyRequests] = useState([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [success, setSuccess] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getMyChangeRequests()
      setMyRequests(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr(null); setSuccess(null)
    if (!form.entityId.trim()) { setErr('Entity ID is required'); return }
    if (form.reason.trim().length < 10) { setErr('Reason must be at least 10 characters'); return }
    if (!form.newValue.trim()) { setErr('New value (JSON) is required'); return }

    let oldJson = null, newJson = {}
    try {
      if (form.oldValue.trim()) oldJson = JSON.parse(form.oldValue)
      newJson = JSON.parse(form.newValue)
    } catch {
      setErr('Old Value and New Value must be valid JSON (or leave Old Value empty)')
      return
    }

    setBusy(true)
    try {
      await requestAdminChange({
        entityType: form.entityType,
        entityId: form.entityId.trim(),
        action: form.action,
        oldValue: oldJson,
        newValue: newJson,
        reason: form.reason.trim(),
      })
      setSuccess('Change request submitted. Awaiting T&P Head approval.')
      setForm(f => ({ ...f, entityId: '', oldValue: '', newValue: '', reason: '' }))
      await loadRequests()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="eyebrow">ADMIN GOVERNANCE</span>
          <h2>Submit Change Request</h2>
          <p>Sensitive changes require T&P Head approval before being applied.</p>
        </div>
      </div>

      {/* Form */}
      <div className="panel">
        <div className="panel-heading">
          <h3>New Change Request</h3>
          <span className="badge badge-PENDING">Requires T&P Approval</span>
        </div>

        <div className="alert info" style={{ marginBottom: 16, fontSize: 12.5 }}>
          🔒 <strong>Separation of duties:</strong> Admin cannot self-approve. The T&P Head will receive this request and decide independently.
        </div>

        {err && <div className="alert error">{err}</div>}
        {success && <div className="alert success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Entity Type <span>*</span></label>
              <select className="form-select" value={form.entityType} onChange={e => set('entityType', e.target.value)}>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Action <span>*</span></label>
              <select className="form-select" value={form.action} onChange={e => set('action', e.target.value)}>
                {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Entity ID (UUID of the affected record) <span>*</span></label>
            <input
              className="form-input"
              value={form.entityId}
              onChange={e => set('entityId', e.target.value)}
              placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
            />
            <div className="form-hint">Find the ID from the database or from the URL of the affected page.</div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Current Value (JSON — optional)</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={form.oldValue}
                onChange={e => set('oldValue', e.target.value)}
                placeholder='{"min_cgpa": 6.5}'
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
              />
              <div className="form-hint">Leave blank if not applicable.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Proposed New Value (JSON) <span>*</span></label>
              <textarea
                className="form-textarea"
                rows={3}
                value={form.newValue}
                onChange={e => set('newValue', e.target.value)}
                placeholder='{"min_cgpa": 7.0}'
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reason for Change <span>*</span> (min 10 characters)</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder="Explain why this change is necessary…"
            />
            <div className="form-hint">{form.reason.length}/10 minimum characters</div>
          </div>

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Submitting…' : '→ Submit Change Request'}
          </button>
        </form>
      </div>

      {/* My requests */}
      <div className="panel">
        <div className="panel-heading">
          <h3>My Submitted Requests</h3>
          <button className="secondary-button btn-sm" onClick={loadRequests} disabled={loading}>↻ Refresh</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="loading-spinner" /></div>
        ) : myRequests.length === 0 ? (
          <p className="empty-copy">No change requests submitted yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myRequests.map(req => {
              const statusStyle = STATUS_COLORS[req.status] || STATUS_COLORS.PENDING_TNP_APPROVAL
              const approval = req.change_request_approvals?.[0]
              return (
                <div key={req.id} style={{
                  background: statusStyle.bg,
                  border: `1px solid ${statusStyle.color}33`,
                  borderRadius: 10,
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{req.action}</span>
                      <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>on {req.entity_type}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: statusStyle.color, background: 'white', padding: '2px 8px', borderRadius: 5 }}>
                      {statusStyle.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: '#334155', margin: 0, marginBottom: 4 }}>{req.reason}</p>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Submitted: {formatDate(req.created_at)}</div>
                  {approval && (
                    <div style={{ marginTop: 8, fontSize: 12, background: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '6px 10px' }}>
                      <strong>T&P Decision:</strong> {approval.decision} — {approval.reason || '—'} ({formatDate(approval.created_at)})
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
