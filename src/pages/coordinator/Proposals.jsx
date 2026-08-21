import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getMyProposals } from '../../services/drives'

const STATUS_COLOR = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', BLOCKED: 'BLOCKED' }

export default function Proposals() {
  const { profile } = useAuth()
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    getMyProposals(profile.id)
      .then((data) => { if (live) setProposals(data) })
      .catch((err) => { if (live) setError(err.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [profile.id])

  if (loading) return <div className="page-state"><div className="loading-spinner" /><span>Loading your proposals…</span></div>

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">COORDINATOR PORTAL</span>
          <h2>My Proposals</h2>
          <p>Shortlist change proposals you have submitted. The T&P Head reviews and approves or rejects them.</p>
        </div>
        <Link className="secondary-button" to="/coordinator">← Candidate pool</Link>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!error && proposals.length === 0 ? (
        <p className="empty-copy">You have not submitted any proposals yet. <Link to="/coordinator">Go to Candidate Pool →</Link></p>
      ) : (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {proposals.map((proposal) => {
            const student = proposal.students
            const drive = proposal.drives
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
                  <span className={`badge badge-${STATUS_COLOR[proposal.status] || proposal.status}`}>
                    {proposal.status}
                  </span>
                </div>
                <div className="meta">
                  <span><strong>Roll:</strong> {student?.roll_number || '—'}</span>
                  <span><strong>Branch:</strong> {student?.branch || '—'}</span>
                  <span><strong>CGPA:</strong> {student?.cgpa || '—'}</span>
                  {drive?.deadline && (
                    <span><strong>Drive deadline:</strong> {new Date(drive.deadline).toLocaleDateString()}</span>
                  )}
                  <span><strong>Submitted:</strong> {new Date(proposal.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: '.85rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', padding: '.65rem', borderRadius: '7px', color: 'var(--text-secondary)' }}>
                  <strong>Reason:</strong> {proposal.reason}
                </div>
                {proposal.status === 'BLOCKED' && (
                  <div className="alert warning" style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
                    This proposal was blocked — the candidate did not meet eligibility requirements at the time of submission.
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
