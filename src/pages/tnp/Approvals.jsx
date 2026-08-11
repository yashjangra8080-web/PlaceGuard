import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getPendingProposals } from '../../services/drives'
import { reviewProposal } from '../../services/placement'

export default function Approvals() {
  const { profile } = useAuth()
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // reviewState: { [proposalId]: { decision, reason, busy, error, done } }
  const [reviewState, setReviewState] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getPendingProposals()
      setProposals(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let live = true
    load().then(() => !live && undefined)
    return () => { live = false }
  }, [load])

  const startReview = (proposalId, decision) => {
    setReviewState((p) => ({
      ...p,
      [proposalId]: { decision, reason: '', busy: false, error: null, done: false },
    }))
  }

  const cancelReview = (proposalId) => {
    setReviewState((p) => { const n = { ...p }; delete n[proposalId]; return n })
  }

  const submitReview = async (proposalId) => {
    const rs = reviewState[proposalId]
    if (!rs || !rs.reason.trim()) return
    setReviewState((p) => ({ ...p, [proposalId]: { ...rs, busy: true, error: null } }))
    try {
      await reviewProposal(proposalId, rs.decision, rs.reason.trim())
      setReviewState((p) => ({ ...p, [proposalId]: { ...rs, busy: false, done: true } }))
      // Remove from list after short delay for UX
      setTimeout(() => {
        setProposals((prev) => prev.filter((p) => p.id !== proposalId))
        setReviewState((p) => { const n = { ...p }; delete n[proposalId]; return n })
      }, 1800)
    } catch (err) {
      setReviewState((p) => ({ ...p, [proposalId]: { ...rs, busy: false, error: err.message } }))
    }
  }

  if (loading) return <div className="page-state">Loading pending proposals…</div>

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">T&P HEAD PORTAL</span>
          <h2>Proposal Approvals</h2>
          <p>Review and approve or reject pending shortlist change proposals. You cannot review proposals you created. All decisions are recorded in the audit trail.</p>
        </div>
        <Link className="secondary-button" to="/tnp">← Dashboard</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!error && proposals.length === 0 ? (
        <p className="empty-copy">No pending proposals require your review.</p>
      ) : (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {proposals.map((proposal) => {
            const rs = reviewState[proposal.id]
            const student = proposal.students
            const drive = proposal.drives
            const isSelf = proposal.proposed_by === profile.id

            return (
              <div className="proposal-card" key={proposal.id}>
                <div className="proposal-card-header">
                  <div>
                    <h4>
                      <span className={`badge badge-${proposal.action === 'ADD' ? 'ELIGIBLE' : 'REJECTED'}`} style={{ marginRight: '.5rem' }}>
                        {proposal.action}
                      </span>
                      {student?.profiles?.name || 'Student'} → {drive?.title || 'Drive'}
                    </h4>
                  </div>
                  <span className="badge badge-PENDING">Pending</span>
                </div>

                <div className="meta">
                  <span><strong>Roll:</strong> {student?.roll_number || '—'}</span>
                  <span><strong>Branch:</strong> {student?.branch || '—'}</span>
                  <span><strong>CGPA:</strong> {student?.cgpa || '—'}</span>
                  <span><strong>Company:</strong> {drive?.companies?.company_name || '—'}</span>
                  {drive?.deadline && (
                    <span><strong>Drive deadline:</strong> {new Date(drive.deadline).toLocaleDateString()}</span>
                  )}
                  <span><strong>Proposed:</strong> {new Date(proposal.created_at).toLocaleString()}</span>
                </div>

                <div style={{ fontSize: '.85rem', background: '#f7f9fa', padding: '.65rem', borderRadius: '7px', color: '#334258', marginBottom: '.75rem' }}>
                  <strong>Coordinator reason:</strong> {proposal.reason}
                </div>

                {isSelf ? (
                  <div className="alert warning" style={{ fontSize: '.82rem' }}>
                    You submitted this proposal. Separation-of-duties prevents self-approval.
                  </div>
                ) : rs?.done ? (
                  <div className="alert" style={{ background: '#ddf5e9', color: '#146647', fontSize: '.85rem' }}>
                    ✓ {rs.decision === 'APPROVED' ? 'Approved' : 'Rejected'} — audit commit recorded.
                  </div>
                ) : rs ? (
                  <div className="review-form">
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: rs.decision === 'APPROVED' ? '#146647' : '#a3322c' }}>
                      {rs.decision === 'APPROVED' ? 'Approving' : 'Rejecting'} — document your reason:
                    </div>
                    <textarea
                      rows={2}
                      style={{ padding: '.5rem', border: '1px solid #cbd4dc', borderRadius: '6px', font: 'inherit', fontSize: '.85rem', resize: 'vertical' }}
                      value={rs.reason}
                      placeholder="Required governance reason (min 5 chars)"
                      onChange={(e) => setReviewState((p) => ({ ...p, [proposal.id]: { ...rs, reason: e.target.value } }))}
                    />
                    {rs.error && <span className="inline-error">{rs.error}</span>}
                    <div className="review-actions">
                      <button
                        className="primary-button"
                        style={{ background: rs.decision === 'APPROVED' ? '#174d47' : '#9c2f2a' }}
                        disabled={rs.busy || !rs.reason.trim()}
                        onClick={() => submitReview(proposal.id)}
                      >
                        {rs.busy ? 'Submitting…' : `Confirm ${rs.decision === 'APPROVED' ? 'Approval' : 'Rejection'}`}
                      </button>
                      <button className="secondary-button" onClick={() => cancelReview(proposal.id)}>Change decision</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button className="primary-button" onClick={() => startReview(proposal.id, 'APPROVED')}>
                      Approve
                    </button>
                    <button
                      className="secondary-button"
                      style={{ color: '#a3322c', borderColor: '#f5c2c0' }}
                      onClick={() => startReview(proposal.id, 'REJECTED')}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
