import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { startTestAttempt, submitMcqAttempt } from '../../services/assessments'

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0') }

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${pad(m)}:${pad(s)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Timer({ totalSeconds, onExpire }) {
  const [remaining, setRemaining] = useState(totalSeconds)
  const expiredRef = useRef(false)

  useEffect(() => {
    if (totalSeconds <= 0) return
    const id = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true
          clearInterval(id)
          onExpire()
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [totalSeconds, onExpire])

  const cls = remaining <= 60
    ? 'test-timer-display danger'
    : remaining <= 300
    ? 'test-timer-display warning'
    : 'test-timer-display'

  return <div className={cls}>⏱ {fmtTime(remaining)}</div>
}

function QuestionNav({ total, current, answers, marked, onJump }) {
  return (
    <div className="test-nav-panel">
      <div className="test-nav-header">Question Navigator</div>
      <div className="test-nav-scroll">
        <div className="q-palette">
          {Array.from({ length: total }, (_, i) => {
            const answered = answers[i] && answers[i].length > 0
            const isMarked = marked.has(i)
            const isActive = i === current
            let cls = 'q-num'
            if (isActive) cls += ' active'
            else if (answered && isMarked) cls += ' answered marked'
            else if (answered) cls += ' answered'
            else if (isMarked) cls += ' marked'
            return (
              <button key={i} className={cls} onClick={() => onJump(i)}>
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>
      <div className="test-legend">
        <div className="test-legend-item">
          <div className="legend-dot" style={{ background: '#059669' }} />
          Answered
        </div>
        <div className="test-legend-item">
          <div className="legend-dot" style={{ background: '#d97706' }} />
          Marked
        </div>
        <div className="test-legend-item">
          <div className="legend-dot" style={{ background: 'var(--card-border)' }} />
          Not visited
        </div>
      </div>
      <div className="test-footer">
        <div className="test-footer-stats" style={{ fontSize: 11.5, color: '#64748b', marginBottom: 0 }}>
          Answered: {Object.values(answers).filter(a => a && a.length > 0).length} / {total}
        </div>
      </div>
    </div>
  )
}

function QuestionCard({ question, qIndex, total, selected, onSelect, onMark, isMarked, negative }) {
  const labels = ['A', 'B', 'C', 'D', 'E']

  return (
    <div className="question-card">
      <div className="question-meta">
        <span className="question-number">Q{qIndex + 1} / {total}</span>
        <span className={`badge badge-${question.difficulty}`} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          {question.difficulty}
        </span>
        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>{question.topic}</span>
        <span style={{ fontSize: 11, color: '#4f46e5', marginLeft: 'auto', fontWeight: 700 }}>
          {question.marks} mark{question.marks !== 1 ? 's' : ''}
          {negative && <span style={{ color: '#dc2626', marginLeft: 4 }}>−{(question.marks * 0.25).toFixed(2)} wrong</span>}
        </span>
      </div>

      <div className="question-text">{question.question_text}</div>

      <div className="options-list">
        {(question.options || []).map((opt, oi) => {
          const isSelected = selected === opt.id
          return (
            <div
              key={opt.id}
              className={`option-row${isSelected ? ' selected' : ''}`}
              onClick={() => onSelect(question.id, opt.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect(question.id, opt.id)}
            >
              <div className="option-label">{labels[oi] || oi + 1}</div>
              <div className="option-text">{opt.option_text}</div>
            </div>
          )
        })}
      </div>

      <div className="question-nav-btns" style={{ marginTop: 20 }}>
        <button
          className={`secondary-button btn-sm${isMarked ? ' text-warning' : ''}`}
          onClick={onMark}
          style={isMarked ? { borderColor: '#d97706', color: '#d97706' } : {}}
        >
          {isMarked ? '★ Marked' : '☆ Mark for review'}
        </button>
        {selected && (
          <button className="btn-ghost btn-sm" onClick={() => onSelect(question.id, null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main TestPage ─────────────────────────────────────────────────────────────
export default function TestPage() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()

  const [testData, setTestData] = useState(null)   // full start_test_attempt response
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [current, setCurrent] = useState(0)         // current question index
  const [answers, setAnswers] = useState({})        // { questionIndex: optionId | null }
  const [questionIdMap, setQuestionIdMap] = useState({}) // questionId → index
  const [marked, setMarked] = useState(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const data = await startTestAttempt(assessmentId)
        if (!live) return
        setTestData(data)
        // Build question id → index map
        const map = {}
        ;(data.questions || []).forEach((q, i) => { map[q.id] = i })
        setQuestionIdMap(map)
        // Pre-fill answers if resumed
        if (data.resumed) {
          setAnswers({})
        }
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [assessmentId])

  const handleSelect = useCallback((questionId, optionId) => {
    const idx = questionIdMap[questionId]
    if (idx === undefined) return
    setAnswers(prev => ({ ...prev, [idx]: optionId }))
  }, [questionIdMap])

  const toggleMark = useCallback(() => {
    setMarked(prev => {
      const next = new Set(prev)
      next.has(current) ? next.delete(current) : next.add(current)
      return next
    })
  }, [current])

  const doSubmit = useCallback(async () => {
    if (!testData) return
    setSubmitting(true)
    setSubmitError(null)
    setShowConfirm(false)

    // Build answer payload
    const answersPayload = (testData.questions || []).map(q => {
      const idx = questionIdMap[q.id]
      const selected = answers[idx]
      return {
        question_id: q.id,
        selected_option_ids: selected ? [selected] : [],
      }
    })

    try {
      const result = await submitMcqAttempt(testData.attempt_id, answersPayload)
      navigate(`/student/test/${assessmentId}/result/${result.attempt_id}`, { replace: true })
    } catch (err) {
      setSubmitting(false)
      setSubmitError(err.message)
    }
  }, [testData, answers, questionIdMap, assessmentId, navigate])

  // handleExpire must be defined AFTER doSubmit so the dep array is not stale.
  // If defined before doSubmit with [], the callback would always capture the
  // initial doSubmit (which sees testData=null) and silently no-op on expiry.
  const handleExpire = useCallback(() => {
    setExpired(true)
    doSubmit()
  }, [doSubmit])

  // ── Render states ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="test-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner" />
        <p style={{ color: '#94a3b8', marginTop: 16, fontFamily: 'Inter,sans-serif' }}>
          Loading your assessment…
        </p>
      </div>
    )
  }

  if (error) {
    // Distinguish "round locked / not yet available" from other errors
    const isRoundLocked = /pending|locked|eligib|round|not.*active|not.*available/i.test(error)
    return (
      <div className="test-layout" style={{ alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        {isRoundLocked ? (
          <div style={{ background: 'var(--card-bg-2)', border: '1px solid var(--card-border-2)', borderRadius: 12, padding: '28px 36px', maxWidth: 500, textAlign: 'center', fontFamily: 'Inter,sans-serif' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
            <h2 style={{ color: '#1e3a5f', marginBottom: 8 }}>This Round Isn&apos;t Available Yet</h2>
            <p style={{ color: '#1e40af', marginBottom: 8, lineHeight: 1.6 }}>
              You can only access this assessment once the previous round has been unlocked.
              Rounds unlock automatically when you pass the current assessment.
            </p>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>
              Technical detail: {error}
            </p>
            <button className="secondary-button" onClick={() => navigate(-1)}>← Back to My Applications</button>
          </div>
        ) : (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 12, padding: '28px 36px', maxWidth: 480, textAlign: 'center', fontFamily: 'Inter,sans-serif' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ color: '#991b1b', marginBottom: 8 }}>Cannot Start Test</h2>
            <p style={{ color: '#7f1d1d', marginBottom: 20 }}>{error}</p>
            <button className="secondary-button" onClick={() => navigate(-1)}>← Go Back</button>
          </div>
        )}
      </div>
    )
  }

  const questions = testData?.questions || []
  const total = questions.length
  const q = questions[current]
  const answeredCount = Object.values(answers).filter(Boolean).length
  const progressPct = total > 0 ? (answeredCount / total) * 100 : 0

  return (
    <div className="test-layout">
      {/* Header */}
      <div className="test-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="test-header-title">{testData?.title}</div>
          <div className="test-header-sub">
            {expired ? '⚠ Time expired — submitting…' : `Question ${current + 1} of ${total}`}
          </div>
        </div>

        <div className="test-progress-bar" title={`${answeredCount}/${total} answered`}>
          <div className="test-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {testData?.duration_minutes > 0 && (
          <Timer
            totalSeconds={testData.duration_minutes * 60}
            onExpire={handleExpire}
          />
        )}

        <button
          className="primary-button btn-sm"
          onClick={() => setShowConfirm(true)}
          disabled={submitting}
          style={{ marginLeft: 8, background: '#059669' }}
        >
          {submitting ? 'Submitting…' : 'Submit Test'}
        </button>
      </div>

      {/* Body */}
      <div className="test-body">
        {/* Question area */}
        <div className="test-question-area">
          {submitError && (
            <div className="alert error" style={{ marginBottom: 16 }}>
              {submitError}
            </div>
          )}

          {q && (
            <QuestionCard
              question={q}
              qIndex={current}
              total={total}
              selected={answers[current] || null}
              onSelect={handleSelect}
              onMark={toggleMark}
              isMarked={marked.has(current)}
              negative={testData?.negative_marking}
            />
          )}

          {/* Prev / Next */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              className="secondary-button"
              disabled={current === 0}
              onClick={() => setCurrent(c => c - 1)}
            >
              ← Previous
            </button>
            {current < total - 1 ? (
              <button
                className="primary-button"
                onClick={() => setCurrent(c => c + 1)}
              >
                Next →
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                style={{ background: '#059669' }}
              >
                Finish & Submit
              </button>
            )}
          </div>
        </div>

        {/* Nav panel */}
        <QuestionNav
          total={total}
          current={current}
          answers={answers}
          marked={marked}
          onJump={setCurrent}
        />
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }}>
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border-2)', borderRadius: 14, padding: '32px 36px',
            maxWidth: 440, width: '90%', fontFamily: 'Inter,sans-serif',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Submit Test?</h2>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span>Answered</span>
                <strong style={{ color: '#059669' }}>{answeredCount} / {total}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span>Unanswered</span>
                <strong style={{ color: '#dc2626' }}>{total - answeredCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Marked for review</span>
                <strong style={{ color: '#d97706' }}>{marked.size}</strong>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              Once submitted, your answers cannot be changed. Are you sure you want to submit?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="secondary-button" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={doSubmit}
                disabled={submitting}
                style={{ background: '#059669' }}
              >
                {submitting ? 'Submitting…' : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
