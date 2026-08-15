import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getCompanyRecord } from '../../services/drives'
import { getCompanyQuestions, getAiGeneratedQuestions } from '../../services/assessments'

const DIFFICULTY_CFG = {
  EASY:   { color: '#16a34a', bg: 'rgba(22,163,74,0.12)'   },
  MEDIUM: { color: '#d97706', bg: 'rgba(217,119,6,0.12)'   },
  HARD:   { color: '#dc2626', bg: 'rgba(220,38,38,0.12)'   },
}

const TYPE_LABELS = {
  MCQ_SINGLE: 'MCQ', MCQ_MULTI: 'Multi-select',
  TRUE_FALSE: 'True/False', SHORT_ANSWER: 'Short Answer',
  CODING: 'Coding',
}

export default function CompanyQuestionBank() {
  const { profile } = useAuth()
  const [companyId, setCompanyId] = useState(null)
  const [questions,  setQuestions]  = useState(null)
  const [aiDrafts,   setAiDrafts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [tab,        setTab]        = useState('approved') // approved | ai_drafts
  const [topicFilter, setTopicFilter] = useState('')
  const [diffFilter,  setDiffFilter]  = useState('')

  useEffect(() => {
    let live = true
    async function bootstrap() {
      try {
        const company = await getCompanyRecord(profile.id)
        if (!company || !live) return
        setCompanyId(company.id)
      } catch (err) {
        if (live) setError(err.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    bootstrap()
    return () => { live = false }
  }, [profile.id])

  const loadQuestions = useCallback(async () => {
    if (!companyId) return
    try {
      const [qs, drafts] = await Promise.all([
        getCompanyQuestions(companyId, {
          topic: topicFilter || undefined,
          difficulty: diffFilter || undefined,
        }),
        getAiGeneratedQuestions(companyId),
      ])
      setQuestions(qs)
      setAiDrafts(drafts)
    } catch (err) {
      setError(err.message)
    }
  }, [companyId, topicFilter, diffFilter])

  useEffect(() => {
    loadQuestions()
  }, [loadQuestions])

  const topics = questions ? [...new Set(questions.map(q => q.topic).filter(Boolean))].sort() : []

  if (loading) return <div className="page-state"><div className="loading-spinner" /><span>Loading…</span></div>
  if (!companyId) return <div className="page-state"><span style={{ color: 'var(--danger)' }}>Company account not found.</span></div>

  const aiPending  = aiDrafts.filter(d => d.review_status === 'PENDING')
  const displayList = tab === 'approved' ? (questions ?? []) : aiDrafts

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">RECRUITER PORTAL</span>
          <h2>Question Bank</h2>
          <p>Your approved questions and AI-generated drafts awaiting review.</p>
        </div>
        {aiPending.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 10, padding: '8px 14px' }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#a78bfa' }}>
              {aiPending.length} AI draft{aiPending.length !== 1 ? 's' : ''} need review
            </span>
          </div>
        )}
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'approved', label: `Approved Questions (${questions?.length ?? 0})` },
          { key: 'ai_drafts', label: `AI Drafts (${aiDrafts.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent-mid)' : 'var(--text-secondary)',
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters (approved tab only) */}
      {tab === 'approved' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select
            value={topicFilter}
            onChange={e => setTopicFilter(e.target.value)}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', padding: '7px 12px', fontSize: 13 }}
          >
            <option value="">All Topics</option>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={diffFilter}
            onChange={e => setDiffFilter(e.target.value)}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', padding: '7px 12px', fontSize: 13 }}
          >
            <option value="">All Difficulties</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
      )}

      {/* Question list */}
      {displayList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{tab === 'approved' ? '📚' : '✨'}</div>
          <div className="empty-state-title">
            {tab === 'approved' ? 'No approved questions' : 'No AI drafts'}
          </div>
          <div className="empty-state-sub">
            {tab === 'approved'
              ? 'Add questions to assessments or approve AI drafts to see them here.'
              : 'Use the AI Question Generator in an Assessment to create draft questions.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {displayList.map((q, idx) => {
            const isAi   = tab === 'ai_drafts'
            const diff   = isAi ? q.draft_payload?.difficulty : q.difficulty
            const topic  = isAi ? q.draft_payload?.topic      : q.topic
            const text   = isAi ? q.draft_payload?.question   : q.question_text
            const type   = isAi ? (q.draft_payload?.type ?? 'MCQ') : q.question_type
            const status = isAi ? q.review_status : 'APPROVED'
            const dfCfg  = DIFFICULTY_CFG[diff] ?? { color: '#64748b', bg: 'transparent' }

            return (
              <div key={q.id ?? idx} className="card" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {/* Difficulty */}
                      <span style={{ fontSize: 10, fontWeight: 700, color: dfCfg.color, background: dfCfg.bg, padding: '2px 7px', borderRadius: 4 }}>
                        {diff ?? '—'}
                      </span>
                      {/* Type */}
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--card-bg-2)', padding: '2px 7px', borderRadius: 4 }}>
                        {TYPE_LABELS[type] ?? type}
                      </span>
                      {/* Topic */}
                      {topic && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '2px 7px', borderRadius: 4 }}>
                          {topic}
                        </span>
                      )}
                      {/* AI badge */}
                      {(isAi || q.ai_generated) && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', padding: '2px 7px', borderRadius: 4 }}>
                          ✨ AI Draft
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.55, margin: 0 }}>
                      {text ?? '(no text)'}
                    </p>
                  </div>

                  {/* Status */}
                  <div style={{ flexShrink: 0 }}>
                    {status === 'PENDING' && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.1)', padding: '3px 9px', borderRadius: 4 }}>
                        Needs Review
                      </span>
                    )}
                    {status === 'APPROVED' && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', padding: '3px 9px', borderRadius: 4 }}>
                        ✓ Approved
                      </span>
                    )}
                    {status === 'REJECTED' && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626', background: 'rgba(220,38,38,0.1)', padding: '3px 9px', borderRadius: 4 }}>
                        Rejected
                      </span>
                    )}
                  </div>
                </div>

                {/* Options preview (approved questions) */}
                {!isAi && q.question_options?.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {q.question_options.map(opt => (
                      <span
                        key={opt.id}
                        style={{
                          fontSize: 12, padding: '3px 10px', borderRadius: 6,
                          background: opt.is_correct ? 'rgba(22,163,74,0.12)' : 'var(--card-bg-2)',
                          color: opt.is_correct ? '#16a34a' : 'var(--text-secondary)',
                          border: opt.is_correct ? '1px solid rgba(22,163,74,0.25)' : '1px solid var(--border)',
                          fontWeight: opt.is_correct ? 700 : 400,
                        }}
                      >
                        {opt.is_correct && '✓ '}{opt.option_text}
                      </span>
                    ))}
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
