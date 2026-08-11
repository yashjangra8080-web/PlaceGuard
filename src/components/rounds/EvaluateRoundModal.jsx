import { useState } from 'react'
import { evaluateRound } from '../../services/rounds'

const STATUS_OPTIONS = [
  { value: 'PASSED',       label: 'Passed',        color: '#146647' },
  { value: 'FAILED',       label: 'Failed',         color: '#a3322c' },
  { value: 'ABSENT',       label: 'Absent',         color: '#7a5c00' },
  { value: 'NOT_ATTEMPTED',label: 'Not Attempted',  color: '#637089' },
]

export default function EvaluateRoundModal({ applicationRound, round, studentName, onClose, onSaved }) {
  const [status, setStatus] = useState('')
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const hasScore = round.max_score != null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!status) { setErr('Select a result status.'); return }
    if (hasScore && score !== '' && (isNaN(parseFloat(score)) || parseFloat(score) < 0)) {
      setErr('Enter a valid non-negative score.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await evaluateRound({
        applicationRoundId: applicationRound.application_round_id,
        status,
        score: hasScore && score !== '' ? parseFloat(score) : null,
        feedback: feedback.trim() || null,
      })
      onSaved()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">EVALUATE</span>
            <h3 style={{ marginBottom: '.15rem' }}>Round {round.round_number}: {round.name}</h3>
            <p style={{ color: '#637089', fontSize: '.85rem', margin: 0 }}>{studentName}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem' }}>
          <div className="form-group" style={{ marginBottom: '.9rem' }}>
            <label>Result *</label>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '.4rem',
                    padding: '.35rem .75rem', borderRadius: '6px', cursor: 'pointer',
                    border: `1.5px solid ${status === opt.value ? opt.color : '#dde2ea'}`,
                    background: status === opt.value ? opt.color + '15' : 'transparent',
                    fontWeight: status === opt.value ? 600 : 400,
                    fontSize: '.875rem', color: status === opt.value ? opt.color : '#374151',
                    transition: 'all .15s',
                  }}
                >
                  <input
                    type="radio" name="status" value={opt.value}
                    checked={status === opt.value}
                    onChange={() => setStatus(opt.value)}
                    style={{ display: 'none' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {hasScore && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.9rem' }}>
              <div className="form-group">
                <label>Score <small>(0 – {round.max_score})</small></label>
                <input
                  type="number" step="0.01" min="0" max={round.max_score}
                  value={score}
                  placeholder={`Out of ${round.max_score}`}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Passing threshold</label>
                <input value={round.passing_score != null ? round.passing_score : 'None'} disabled style={{ background: '#f5f7fa' }} />
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '.9rem' }}>
            <label>Feedback <small>(optional)</small></label>
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Notes on performance, specific strengths or areas to improve…"
            />
          </div>

          {round.is_elimination && (
            <p style={{ fontSize: '.8rem', color: '#7a5c00', background: '#fffbeb', padding: '.5rem .75rem', borderRadius: '6px', marginBottom: '.75rem' }}>
              ⚠ This is an <strong>elimination round</strong>. FAILED or ABSENT will reject the candidate.
            </p>
          )}

          {err && <div className="alert error" style={{ marginBottom: '.75rem' }}>{err}</div>}

          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={busy || !status}>
              {busy ? 'Saving…' : 'Save evaluation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
