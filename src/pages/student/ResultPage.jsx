import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getAttemptResult } from '../../services/assessments'
import { candidateAnalysis } from '../../services/ai'

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

  // AI analysis — separate state, never affects official result
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

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

  const handleAiAnalysis = async () => {
    if (!result || aiLoading) return
    setAiLoading(true)
    setAiError(null)
    try {
      const sectionResults = Array.isArray(result.section_results) ? result.section_results : []
      const data = await candidateAnalysis({
        student_name: 'Student',   // name not stored in attempt result for privacy
        results: [{
          round_name: result.assessment_title,
          total_score: result.total_score,
          max_score: result.max_score,
          percentage: result.percentage,
          passed: result.passed,
          section_results: sectionResults,
        }],
      })
      setAiAnalysis(data.analysis)
    } catch (err) {
      setAiError(err.message || 'AI analysis temporarily unavailable. Please try again later.')
    } finally {
      setAiLoading(false)
    }
  }

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

      {/* AI Candidate Analysis — advisory only, never alters official result */}
      <div className="panel" style={{ marginTop: 8 }}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Advisory · AI-generated</span>
            <h3>✨ AI Performance Analysis</h3>
          </div>
          {!aiAnalysis && (
            <button
              className="primary-button btn-sm"
              style={{ background: '#7c3aed' }}
              onClick={handleAiAnalysis}
              disabled={aiLoading}
            >
              {aiLoading ? '✨ Analysing…' : '✨ Get AI Analysis'}
            </button>
          )}
        </div>

        {!aiAnalysis && !aiLoading && !aiError && (
          <p className="empty-copy">
            Click "Get AI Analysis" to receive an AI-generated performance review based on your actual result data.
            This is advisory only — your official result is final.
          </p>
        )}

        {aiLoading && (
          <div className="page-state" style={{ minHeight: 60 }}>
            <div className="loading-spinner" />
            <span>Calling Gemini — this may take 10–20 seconds…</span>
          </div>
        )}

        {aiError && (
          <div className="alert error">{aiError}</div>
        )}

        {aiAnalysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {/* Summary */}
            {aiAnalysis.ai_summary && (
              <div style={{
                background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.18)',
                borderRadius: 10, padding: '14px 18px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                  AI Summary
                </div>
                <p style={{ fontSize: 13.5, color: '#1e293b', lineHeight: 1.6, margin: 0 }}>{aiAnalysis.ai_summary}</p>
              </div>
            )}

            {/* Performance tier */}
            {aiAnalysis.performance_tier && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                  background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7',
                }}>
                  Tier: {aiAnalysis.performance_tier}
                </span>
                {aiAnalysis.hiring_signal && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                    background: aiAnalysis.hiring_signal === 'Positive' ? '#d1fae5' : '#fee2e2',
                    color: aiAnalysis.hiring_signal === 'Positive' ? '#065f46' : '#991b1b',
                    border: `1px solid ${aiAnalysis.hiring_signal === 'Positive' ? '#6ee7b7' : '#fca5a5'}`,
                  }}>
                    Signal: {aiAnalysis.hiring_signal}
                  </span>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Strengths */}
              {Array.isArray(aiAnalysis.strongest_areas) && aiAnalysis.strongest_areas.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 6 }}>✓ Strongest Areas</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {aiAnalysis.strongest_areas.map((a, i) => (
                      <li key={i} style={{ fontSize: 12.5, color: '#374151' }}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {Array.isArray(aiAnalysis.weakest_areas) && aiAnalysis.weakest_areas.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>⚠ Areas to Improve</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {aiAnalysis.weakest_areas.map((a, i) => (
                      <li key={i} style={{ fontSize: 12.5, color: '#374151' }}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Preparation recommendations */}
            {Array.isArray(aiAnalysis.recommended_preparation) && aiAnalysis.recommended_preparation.length > 0 && (
              <div style={{ background: 'rgba(79,70,229,0.04)', borderRadius: 8, padding: '12px 16px', border: '1px solid rgba(79,70,229,0.12)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', marginBottom: 6 }}>📚 Preparation Recommendations</div>
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {aiAnalysis.recommended_preparation.map((r, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: '#374151' }}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Disclaimer */}
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>
              {aiAnalysis.disclaimer || 'AI-generated analysis based on assessment data. Your official score and pass/fail result are determined by the assessment system and are not altered by AI.'}
            </p>
          </div>
        )}
      </div>

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
