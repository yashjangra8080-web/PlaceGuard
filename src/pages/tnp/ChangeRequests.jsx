import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getPendingChangeRequests, getAdminChangeRequests, approveAdminChange } from '../../services/assessments'

const STATUS_BADGE = {
  PENDING_TNP_APPROVAL: 'badge-PENDING',
  APPROVED: 'badge-SELECTED',
  REJECTED: 'badge-REJECTED',
  WITHDRAWN: 'badge-LOCKED',
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DecisionModal({ request, onClose, onSubmit }) {
  const [decision, setDecision] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const handleSubmit = async () => {
    if (!decision) { setErr('Select Approve or Reject'); return }
    if (reason.trim().length < 5) { setErr('Please provide a reason (min 5 characters)'); return }
    setBusy(true); setErr(null)
    try {
      await onSubmit(request.id, decision, reason.trim())
      onClose()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border-2)', borderRadius: 14, padding: '28px 32px', maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Review Change Request</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16 }}>{request.action} on {request.entity_type}</p>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>REASON FROM ADMIN</div>
          <p style={{ fontSize: 13, margin: 0, color: 'var(--text-primary)' }}>{request.reason}</p>
        </div>

        {request.new_value && (
          <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>PROPOSED CHANGE</div>
            <pre style={{ fontSize: 12, margin: 0, color: 'var(--success)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(request.new_value, null, 2)}
            </pre>
          </div>
        )}

        {err && <div className="alert error" style={{ marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => setDecision('APPROVED')}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: decision === 'APPROVED' ? 'var(--success)' : 'var(--success-bg)',
              color: decision === 'APPROVED' ? '#fff' : 'var(--success)',
              border: `2px solid ${decision === 'APPROVED' ? '#059669' : '#6ee7b7'}`,
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => setDecision('REJECTED')}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: decision === 'REJECTED' ? 'var(--danger)' : 'var(--danger-bg)',
              color: decision === 'REJECTED' ? '#fff' : 'var(--danger)',
              border: `2px solid ${decision === 'REJECTED' ? '#dc2626' : '#fca5a5'}`,
            }}
          >
            ✗ Reject
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Your reason / notes</label>
          <textarea className="form-textarea" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Briefly explain your decision…" />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary-button" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Decision'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChangeRequests() {
  useAuth()
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState([])
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviewing, setReviewing] = useState(null) // request being reviewed

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [p, a] = await Promise.all([
        getPendingChangeRequests(),
        getAdminChangeRequests(),
      ])
      setPending(p); setAll(a)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDecision = async (requestId, decision, reason) => {
    await approveAdminChange(requestId, decision, reason)
    await load()
  }

  const renderCard = (req) => (
    <div key={req.id} className={`change-request-card ${
      req.status === 'PENDING_TNP_APPROVAL' ? 'pending'
      : req.status === 'APPROVED' ? 'approved'
      : 'rejected'
    }`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge ${STATUS_BADGE[req.status] || 'badge-PENDING'}`}>{req.status?.replace('_', ' ')}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(req.created_at)}</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{req.action}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Entity: <strong>{req.entity_type}</strong> · ID: <code style={{ fontSize: 10 }}>{req.entity_id}</code>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--card-border)' }}>
            {req.reason}
          </div>
          {req.change_request_approvals?.[0] && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', background: req.status === 'APPROVED' ? 'var(--success-bg)' : 'var(--danger-bg)', borderRadius: 8, padding: '6px 10px' }}>
              <strong>T&P decision:</strong> {req.change_request_approvals[0].decision} — {req.change_request_approvals[0].reason}
            </div>
          )}
        </div>
        {req.status === 'PENDING_TNP_APPROVAL' && (
          <button className="primary-button btn-sm" onClick={() => setReviewing(req)}>
            Review
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="eyebrow">T&P HEAD GOVERNANCE</span>
          <h2>Change Request Review</h2>
          <p>Admin-submitted sensitive change requests requiring T&P approval.</p>
        </div>
        <button className="secondary-button" onClick={load} disabled={loading}>↻ Refresh</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="tab-bar">
        <button className={`tab-btn${tab === 'pending' ? ' active' : ''}`} onClick={() => setTab('pending')}>
          Pending {pending.length > 0 && <span className="sidebar-badge" style={{ marginLeft: 6 }}>{pending.length}</span>}
        </button>
        <button className={`tab-btn${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All</button>
      </div>

      {loading ? (
        <div className="page-state"><div className="loading-spinner" /></div>
      ) : tab === 'pending' ? (
        pending.length === 0
          ? <p className="empty-copy">No pending change requests.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{pending.map(renderCard)}</div>
      ) : (
        all.length === 0
          ? <p className="empty-copy">No change requests yet.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{all.map(renderCard)}</div>
      )}

      {reviewing && (
        <DecisionModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={handleDecision}
        />
      )}
    </div>
  )
}
