import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PassBadge({ passed }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
      color: passed ? '#16a34a' : '#dc2626',
      background: passed ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
      border: `1px solid ${passed ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
      padding: '2px 8px', borderRadius: 4,
    }}>
      {passed ? '✓ Passed' : '✗ Not Qualified'}
    </span>
  )
}

export default function StudentResults() {
  const { profile } = useAuth()
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        // assessment_results is the real table (written by submit_mcq_attempt).
        // RLS policy: student_profile_id = auth.uid() — only own results visible.
        // Join path: assessment_results → test_attempts → assessments → drive_rounds → drives → companies
        const { data, error: qErr } = await supabase
          .from('assessment_results')
          .select(`
            id,
            attempt_id,
            total_score,
            max_score,
            percentage,
            correct_count,
            incorrect_count,
            unanswered_count,
            accuracy,
            time_taken_seconds,
            passed,
            computed_at,
            assessment_id,
            test_attempts!inner(
              id,
              started_at,
              submitted_at,
              status
            ),
            assessments!inner(
              id,
              title,
              drive_round_id,
              drive_rounds!inner(
                id,
                name,
                round_type,
                drive_id,
                drives!inner(
                  id,
                  title,
                  role_name,
                  companies(company_name)
                )
              )
            )
          `)
          .order('computed_at', { ascending: false })

        if (qErr) throw qErr
        if (live) setResults(data ?? [])
      } catch (err) {
        if (live) setError(err.message)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">STUDENT PORTAL</span>
          <h2>My Results</h2>
          <p>Your complete assessment history across all recruitment rounds.</p>
        </div>
      </div>

      {error && (
        <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {results === null ? (
        <div className="page-state">
          <div className="loading-spinner" />
          <span>Loading your results…</span>
        </div>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No results yet</div>
          <div className="empty-state-sub">
            Your test results will appear here after you complete and submit an assessment.
          </div>
          <Link to="/student/tests" className="primary-button" style={{ marginTop: '1rem' }}>
            View active tests →
          </Link>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Round</th>
                <th>Company</th>
                <th style={{ textAlign: 'center' }}>Score</th>
                <th style={{ textAlign: 'center' }}>Accuracy</th>
                <th style={{ textAlign: 'center' }}>Result</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                // assessment_results has direct FK to both test_attempts and assessments
                const attempt = r.test_attempts
                const asmt = r.assessments          // direct join, not nested under test_attempts
                const drRound = asmt?.drive_rounds
                const drive = drRound?.drives
                const company = drive?.companies?.company_name ?? '—'
                const pct = r.percentage ?? 0
                // accuracy is already computed server-side; use it directly
                const accuracy = r.accuracy ?? 0

                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                        {asmt?.title ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {drive?.title ?? '—'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {drRound?.name ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{company}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 800, fontSize: 15,
                        color: pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626',
                      }}>
                        {r.total_score ?? 0}
                        <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-tertiary)' }}>
                          /{r.max_score ?? '?'}
                        </span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {accuracy}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <PassBadge passed={r.passed} />
                    </td>
                    <td>
                      <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {fmt(r.computed_at)}
                      </span>
                    </td>
                    <td>
                      {attempt?.id && (
                        <Link
                          to={`/student/test/${asmt?.id}/result/${attempt.id}`}
                          className="secondary-button btn-sm"
                          style={{ whiteSpace: 'nowrap', fontSize: 12 }}
                        >
                          Full Report →
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
