import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStudentRecord, getStudentApplications } from '../../services/drives'
import { getMyApplicationRounds } from '../../services/rounds'
import { getAssessmentForRound } from '../../services/assessments'

const ROUND_TYPE_LABELS = {
  APTITUDE: 'Aptitude', CODING: 'Coding', SQL_ASSESSMENT: 'SQL/Python',
  LINUX_ASSESSMENT: 'Linux/Net', CLOUD_ASSESSMENT: 'Cloud',
  TECHNICAL_INTERVIEW: 'Technical', HR_INTERVIEW: 'HR', ASSESSMENT: 'Assessment',
}

const DIFFICULTY_COLORS = { EASY: '#16a34a', MEDIUM: '#d97706', HARD: '#dc2626' }

function TestCard({ item }) {
  const navigate = useNavigate()
  const { companyName, driveName, roundName, roundType, assessmentId,
          durationMinutes, totalQuestions, existingStatus, existingAttemptId, resultId } = item

  const isSubmitted = existingStatus === 'SUBMITTED'
  const isInProgress = existingStatus === 'IN_PROGRESS'

  const handleAction = () => {
    if (isSubmitted && resultId) {
      navigate(`/student/test/${assessmentId}/result/${existingAttemptId}`)
    } else {
      navigate(`/student/test/${assessmentId}`)
    }
  }

  return (
    <article className="card" style={{ padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7,
              color: '#818cf8', background: 'rgba(129,140,248,0.12)', padding: '2px 8px', borderRadius: 4,
            }}>
              {ROUND_TYPE_LABELS[roundType] ?? roundType}
            </span>
            {isSubmitted && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                SUBMITTED
              </span>
            )}
            {isInProgress && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                IN PROGRESS
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            {roundName}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {companyName} · {driveName}
          </div>
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 11, background: 'rgba(79,70,229,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {isSubmitted ? '✅' : isInProgress ? '⏱️' : '📝'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>⏱</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {durationMinutes} min
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>📋</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {totalQuestions ?? '—'} questions
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isSubmitted ? (
          <button className="secondary-button btn-sm" onClick={handleAction}>
            📊 View Result
          </button>
        ) : isInProgress ? (
          <button className="primary-button btn-sm" onClick={handleAction} style={{ background: '#d97706' }}>
            ▶ Resume Test
          </button>
        ) : (
          <button className="primary-button btn-sm" onClick={handleAction}>
            ▶ Start Test
          </button>
        )}
      </div>
    </article>
  )
}

export default function StudentTests() {
  const { profile } = useAuth()
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const student = await getStudentRecord(profile.id)
        if (!student) { if (live) setItems([]); return }

        const apps = await getStudentApplications(student.id)
        if (!apps.length) { if (live) setItems([]); return }

        const results = []
        await Promise.all(apps.map(async (app) => {
          try {
            const rounds = await getMyApplicationRounds(app.id)
            const pending = rounds.filter(r => ['PENDING', 'IN_PROGRESS'].includes(r.status))
            await Promise.all(pending.map(async (r) => {
              try {
                const asmt = await getAssessmentForRound(r.round_id)
                if (!asmt || !asmt.assessment_id) return
                results.push({
                  roundId: r.round_id,
                  roundName: r.name,
                  roundType: r.round_type,
                  driveName: app.drives?.title || '—',
                  companyName: app.drives?.companies?.company_name || '—',
                  assessmentId: asmt.assessment_id,
                  durationMinutes: asmt.duration_minutes,
                  totalQuestions: asmt.total_questions,
                  existingStatus: asmt.existing_attempt_status,
                  existingAttemptId: asmt.existing_attempt_id,
                  resultId: asmt.result_id,
                  isActive: asmt.is_active,
                })
              } catch { /* skip inactive or errored */ }
            }))
          } catch { /* skip errored apps */ }
        }))

        if (live) setItems(results)
      } catch (err) {
        if (live) setError(err.message)
      }
    }
    load()
    return () => { live = false }
  }, [profile.id])

  const active = items?.filter(i => !i.existingStatus || i.existingStatus === 'IN_PROGRESS') ?? []
  const submitted = items?.filter(i => i.existingStatus === 'SUBMITTED') ?? []

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">STUDENT PORTAL</span>
          <h2>My Tests</h2>
          <p>Active assessments across all your applications.</p>
        </div>
      </div>

      {error && (
        <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {items === null ? (
        <div className="page-state">
          <div className="loading-spinner" />
          <span>Loading your tests…</span>
        </div>
      ) : (
        <>
          {/* Active / available tests */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: '1rem' }}>
              Available Tests ({active.length})
            </div>
            {active.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-title">No active tests</div>
                <div className="empty-state-sub">
                  Tests will appear here when companies activate assessments for your pending rounds.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {active.map(item => (
                  <TestCard key={`${item.assessmentId}-${item.roundId}`} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Submitted tests */}
          {submitted.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: '1rem' }}>
                Submitted ({submitted.length})
              </div>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {submitted.map(item => (
                  <TestCard key={`${item.assessmentId}-${item.roundId}`} item={item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
