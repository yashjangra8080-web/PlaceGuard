import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getAttemptResult } from '../../services/assessments'

function getBarColor(pct) {
  if (pct >= 75) return '#059669'
  if (pct >= 50) return '#d97706'
  return '#dc2626'
}

function ScoreCircle({ percentage, passed }) {
  const color = passed ? '#059669' : '#dc2626'
  return (
    <div style={{
      width: 120, height: 120, borderRadius: '50%',
      border: `8px solid ${color}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'white', lineHeight: 1 }}>
        {Math.round(percentage)}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>%</div>
    </div>
  )
}

export default function ResultPage() {
  const { attemptId } = useParams()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviewTab, setReviewTab] = useState(false)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const data = await getAttemptResult(attemptId)
        if (live) setResult(data)
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [attemptId])

  if (loading) return (
    <div className="page-state">
      <div className="loading-spinner" />
      <span>Loading your result…</span>
    </div>
  )

  if (error) return (
    <div className="page-state" style={{ flexDirection: 'column', gap: 12 }}>
      <div className="alert error">{error}</div>
      <Link to="/student/applications" className="secondary-button">
        ← Back to Applications
      </Link>
    </div>
  )

  const r = result
  const passed = r.passed
  const sectionResults = Array.isArray(r.section_results) ? r.section_results : []
  const questionReview = Array.isArray(r.question_review) ? r.question_review : []
  const timeTaken = r.time_taken_seconds || 0
  const mins = Math.floor(timeTaken / 60)
  const secs = timeTaken % 60

  return (
    <div className="result-page">
      {/* Hero */}
      <div className="result-hero">
        <ScoreCircle percentage={r.percentage} passed={passed} />

        <div className="result-hero-details">
          <div className="result-hero-title">Assessment Result</div>
          <div className="result-hero-name">{r.assessment_title}</div>
          <span className={`result-status-badge ${passed ? 'passed' : 'failed'}`}>
            {passed ? '✓ PASSED' : '✗ FAILED'}
          </span>
          {r.passing_score != null && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Passing score: {r.passing_score} · Your score: {r.total_score}
            </div>
          )}
          {r.round_status === 'PASSED' && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#86efac', fontWeight: 600 }}>
              🎉 Next round has been unlocked!
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="result-stats-grid">
        <div className="result-stat">
          <div className="result-stat-label">Score</div>
          <div className="result-stat-value">{r.total_score}<span style={{ fontSize: 14, color: '#94a3b8' }}>/{r.max_score}</span></div>
        </div>
        <div className="result-stat">
          <div className="result-stat-label">Correct</div>
          <div className="result-stat-value green">{r.correct_count}</div>
        </div>
        <div className="result-stat">
          <div className="result-stat-label">Incorrect</div>
          <div className="result-stat-value red">{r.incorrect_count}</div>
        </div>
        <div className="result-stat">
          <div className="result-stat-label">Unanswered</div>
          <div className="result-stat-value orange">{r.unanswered_count}</div>
        </div>
        <div className="result-stat">
          <div className="result-stat-label">Accuracy</div>
          <div className="result-stat-value blue">{r.accuracy}%</div>
        </div>
        <div className="result-stat">
          <div className="result-stat-label">Time Taken</div>
          <div className="result-stat-value" style={{ fontSize: 18 }}>
            {mins}m {secs}s
          </div>
        </div>
      </div>

      {/* Topic breakdown */}
      {sectionResults.length > 0 && (
        <div className="panel topic-section">
          <div className="panel-heading">
            <h3>Performance by Topic</h3>
          </div>
          {sectionResults.map((sec, i) => {
            const pct = sec.max_score > 0 ? Math.round((sec.score / sec.max_score) * 100) : 0
            return (
              <div key={i} className="topic-row">
                <div className="topic-name" title={sec.topic}>
                  {sec.topic}
                  <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>{sec.difficulty}</span>
                </div>
                <div className="topic-bar-bg">
                  <div
                    className="topic-bar-fill"
                    style={{ width: `${pct}%`, background: getBarColor(pct) }}
                  />
                </div>
                <div className="topic-pct" style={{ color: getBarColor(pct) }}>{pct}%</div>
                <div style={{ fontSize: 11, color: '#94a3b8', width: 60, textAlign: 'right', flexShrink: 0 }}>
                  {sec.correct}/{sec.total}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Answer review */}
      {r.allow_review && questionReview.length > 0 && (
        <div className="panel">
          <div className="panel-heading">
            <h3>Answer Review</h3>
            <button
              className="secondary-button btn-sm"
              onClick={() => setReviewTab(t => !t)}
            >
              {reviewTab ? 'Hide' : 'Show'} review
            </button>
          </div>

          {reviewTab && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {questionReview.map((q, qi) => {
                const sa = q.student_answer
                const isCorrect = sa?.is_correct
                const isUnanswered = !sa || !sa.selected_option_ids || sa.selected_option_ids.length === 0
                const cls = isUnanswered ? 'review-question unanswered-q' : isCorrect ? 'review-question correct-q' : 'review-question wrong-q'

                return (
                  <div key={q.id} className={cls}>
                    <div className="review-q-text">
                      <strong style={{ color: '#64748b', marginRight: 6, fontSize: 11 }}>Q{qi + 1}</strong>
                      {q.question_text}
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700,
                        color: isUnanswered ? '#94a3b8' : isCorrect ? '#059669' : '#dc2626' }}>
                        {isUnanswered ? '— Not answered' : isCorrect ? `+${sa.marks_awarded}` : `${sa.marks_awarded}`}
                      </span>
                    </div>

                    <div className="review-options">
                      {(q.options || []).map(opt => {
                        const wasSelected = sa?.selected_option_ids?.includes(opt.id)
                        const cls = opt.is_correct
                          ? 'review-opt correct-ans'
                          : wasSelected && !opt.is_correct
                          ? 'review-opt wrong-ans'
                          : 'review-opt'
                        return (
                          <div key={opt.id} className={cls}>
                            {opt.is_correct ? '✓ ' : wasSelected ? '✗ ' : '  '}
                            {opt.option_text}
                          </div>
                        )
                      })}
                    </div>

                    {q.explanation && (
                      <div className="review-explanation">
                        💡 {q.explanation}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        <Link to="/student/applications" className="primary-button">
          ← My Applications
        </Link>
        <Link to="/student" className="secondary-button">
          Browse Drives
        </Link>
      </div>
    </div>
  )
}
