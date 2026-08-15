import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  getAssessmentByRound,
  createAssessment,
  activateAssessment,
  deactivateAssessment,
  createQuestion,
  removeQuestionFromAssessment,
  getAssessmentQuestions,
} from '../../services/assessments'
import { generateQuestions, saveAiGeneratedQuestions } from '../../services/ai'

const DIFFICULTY_COLORS = { EASY: '#059669', MEDIUM: '#d97706', HARD: '#dc2626' }
const ROUND_TYPE_LABELS = {
  APTITUDE: 'Aptitude', CODING: 'Coding', TECHNICAL_INTERVIEW: 'Tech Interview',
  HR_INTERVIEW: 'HR Interview', SQL_ASSESSMENT: 'SQL', LINUX_ASSESSMENT: 'Linux',
  CLOUD_ASSESSMENT: 'Cloud', ASSESSMENT: 'Assessment',
}

// ── Create Assessment Form ────────────────────────────────────────────────────
function CreateAssessmentForm({ driveRoundId, onCreated }) {
  const [form, setForm] = useState({
    title: '', instructions: '', durationMinutes: 45,
    passingScore: '', negativeMarking: false, negativeFraction: 0.25,
    shuffleQuestions: true, shuffleOptions: true, allowReview: true,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setErr('Title is required'); return }
    if (form.durationMinutes < 1 || form.durationMinutes > 360) { setErr('Duration must be 1–360 minutes'); return }
    setBusy(true); setErr(null)
    try {
      const a = await createAssessment({
        driveRoundId,
        title: form.title.trim(),
        instructions: form.instructions.trim(),
        durationMinutes: Number(form.durationMinutes),
        passingScore: form.passingScore ? Number(form.passingScore) : null,
        negativeMarking: form.negativeMarking,
        negativeFraction: Number(form.negativeFraction),
        shuffleQuestions: form.shuffleQuestions,
        shuffleOptions: form.shuffleOptions,
        allowReview: form.allowReview,
      })
      onCreated(a)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-heading"><h3>Create Assessment for this Round</h3></div>
      {err && <div className="alert error">{err}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Assessment Title <span>*</span></label>
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Aptitude Test — Round 1" />
        </div>
        <div className="form-group">
          <label className="form-label">Instructions</label>
          <textarea className="form-textarea" value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="Instructions shown to students before starting…" rows={3} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Duration (minutes) <span>*</span></label>
            <input className="form-input" type="number" min={1} max={360} value={form.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Passing Score (blank = no minimum)</label>
            <input className="form-input" type="number" min={0} value={form.passingScore} onChange={e => set('passingScore', e.target.value)} placeholder="e.g. 14" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            ['negativeMarking', 'Negative marking'],
            ['shuffleQuestions', 'Shuffle questions'],
            ['shuffleOptions', 'Shuffle options'],
            ['allowReview', 'Allow answer review after submission'],
          ].map(([k, label]) => (
            <label key={k} className="form-check">
              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} />
              <label>{label}</label>
            </label>
          ))}
        </div>
        {form.negativeMarking && (
          <div className="form-group">
            <label className="form-label">Negative marking fraction (e.g. 0.25 = ¼ mark deducted)</label>
            <input className="form-input" type="number" step="0.05" min={0} max={1} value={form.negativeFraction} onChange={e => set('negativeFraction', e.target.value)} style={{ maxWidth: 140 }} />
          </div>
        )}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create Assessment'}
        </button>
      </form>
    </div>
  )
}

// ── Add Question Form ─────────────────────────────────────────────────────────
function AddQuestionForm({ assessmentId, onAdded }) {
  const [form, setForm] = useState({
    questionText: '', questionType: 'MCQ_SINGLE',
    topic: '', difficulty: 'MEDIUM', marks: 2, explanation: '',
    options: [
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setOpt = (i, k, v) => {
    setForm(f => {
      const opts = [...f.options]
      opts[i] = { ...opts[i], [k]: v }
      // For MCQ_SINGLE, uncheck others when one is checked
      if (k === 'is_correct' && v && f.questionType === 'MCQ_SINGLE') {
        opts.forEach((o, j) => { if (j !== i) opts[j] = { ...opts[j], is_correct: false } })
      }
      return { ...f, options: opts }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr(null); setOk(null)
    const validOpts = form.options.filter(o => o.text.trim())
    if (!form.questionText.trim()) { setErr('Question text required'); return }
    if (validOpts.length < 2) { setErr('At least 2 options required'); return }
    if (!validOpts.some(o => o.is_correct)) { setErr('Mark at least one correct answer'); return }
    setBusy(true)
    try {
      await createQuestion({
        assessmentId, questionText: form.questionText.trim(),
        questionType: form.questionType, topic: form.topic.trim() || 'General',
        difficulty: form.difficulty, marks: Number(form.marks),
        explanation: form.explanation.trim() || null,
        options: validOpts,
      })
      setOk('Question added to assessment!')
      setForm(f => ({ ...f, questionText: '', topic: '', explanation: '', options: Array(4).fill({ text: '', is_correct: false }).map(o => ({ ...o })) }))
      onAdded()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-heading"><h3>Add New Question</h3></div>
      {err && <div className="alert error">{err}</div>}
      {ok && <div className="alert success">{ok}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Question Text <span>*</span></label>
          <textarea className="form-textarea" value={form.questionText} onChange={e => set('questionText', e.target.value)} placeholder="Enter the question…" rows={2} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Topic</label>
            <input className="form-input" value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="e.g. Quantitative, SQL, JavaScript" />
          </div>
          <div className="form-group">
            <label className="form-label">Difficulty</label>
            <select className="form-select" value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Marks</label>
            <input className="form-input" type="number" min={0.5} step={0.5} value={form.marks} onChange={e => set('marks', e.target.value)} style={{ maxWidth: 100 }} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Options (check the correct one)</label>
          {form.options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
              <input
                type={form.questionType === 'MCQ_MULTI' ? 'checkbox' : 'radio'}
                checked={opt.is_correct}
                onChange={e => setOpt(i, 'is_correct', e.target.checked)}
                name="correct-option"
                style={{ flexShrink: 0, width: 16, height: 16, accentColor: '#059669' }}
              />
              <input
                className="form-input"
                value={opt.text}
                onChange={e => setOpt(i, 'text', e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
              />
            </div>
          ))}
        </div>
        <div className="form-group">
          <label className="form-label">Explanation (shown after submission)</label>
          <input className="form-input" value={form.explanation} onChange={e => set('explanation', e.target.value)} placeholder="Why is the correct answer correct?" />
        </div>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Adding…' : '+ Add Question'}
        </button>
      </form>
    </div>
  )
}

// ── AI Question Generator ─────────────────────────────────────────────────────
function AiGenerator({ companyId, assessmentId, roundType, onDraftsCreated }) {
  const [form, setForm] = useState({ topic: '', difficulty: 'MEDIUM', count: 5, role: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [approving, setApproving] = useState({})
  const [approveMsg, setApproveMsg] = useState({})

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleGenerate = async () => {
    if (!form.topic.trim()) { setErr('Topic is required'); return }
    setBusy(true); setErr(null); setDrafts([])
    try {
      const result = await generateQuestions({
        role: form.role || 'Software Engineer',
        round_type: roundType || 'APTITUDE',
        topic: form.topic,
        difficulty: form.difficulty,
        count: form.count,
      })
      const qs = result.questions || []
      const { drafts: saved } = await saveAiGeneratedQuestions(companyId, 'QUESTIONS', { topic: form.topic, difficulty: form.difficulty }, qs)
      setDrafts(saved || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleApprove = async (draft, i) => {
    setApproving(p => ({ ...p, [i]: true }))
    setApproveMsg(p => ({ ...p, [i]: null }))
    try {
      const { approveAiQuestion } = await import('../../services/assessments')
      await approveAiQuestion(draft.id, assessmentId)
      setApproveMsg(p => ({ ...p, [i]: { ok: true } }))
      onDraftsCreated()
    } catch (e) {
      setApproveMsg(p => ({ ...p, [i]: { ok: false, msg: e.message } }))
    } finally {
      setApproving(p => ({ ...p, [i]: false }))
    }
  }

  const handleReject = async (draft, i) => {
    try {
      const { rejectAiQuestion } = await import('../../services/assessments')
      await rejectAiQuestion(draft.id)
      setDrafts(prev => prev.filter((_, j) => j !== i))
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="ai-panel">
        <div className="ai-panel-header">
          <div className="ai-icon">✨</div>
          <div>
            <div className="ai-panel-title">AI Question Generator</div>
            <div className="ai-panel-sub">Powered by Gemini · Drafts require human approval</div>
          </div>
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Topic <span>*</span></label>
            <input className="form-input" value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="e.g. Quantitative Aptitude, SQL, React" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Difficulty</label>
            <select className="form-select" value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Count (1–20)</label>
            <input className="form-input" type="number" min={1} max={20} value={form.count} onChange={e => set('count', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Job Role context</label>
            <input className="form-input" value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Frontend Developer" />
          </div>
        </div>
        <button className="primary-button" style={{ marginTop: 16, background: '#7c3aed' }} onClick={handleGenerate} disabled={busy}>
          {busy ? '✨ Generating…' : '✨ Generate Questions'}
        </button>
        {busy && <p style={{ fontSize: 12, color: '#6d28d9', marginTop: 8 }}>Calling Gemini — this may take 10–20 seconds…</p>}
      </div>

      {drafts.length > 0 && (
        <div className="panel">
          <div className="panel-heading">
            <h3>AI Draft Questions ({drafts.length})</h3>
            <p style={{ fontSize: 12, color: '#64748b' }}>Review and approve questions to add them to the assessment.</p>
          </div>
          {drafts.map((d, i) => {
            const msg = approveMsg[i]
            return (
              <div key={d.id} className="draft-question-card">
                {msg?.ok && <div className="alert success" style={{ marginBottom: 8 }}>✓ Approved and added to assessment</div>}
                {msg && !msg.ok && <div className="alert error" style={{ marginBottom: 8 }}>{msg.msg}</div>}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-ai">AI Generated</span>
                  <span style={{ fontSize: 11, color: DIFFICULTY_COLORS[d.difficulty] || '#64748b', fontWeight: 700 }}>{d.difficulty}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{d.topic}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{d.marks} mark(s)</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 10 }}>{d.question_text}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(Array.isArray(d.options) ? d.options : []).map((o, oi) => (
                    <div key={oi} style={{
                      fontSize: 12.5, padding: '5px 10px', borderRadius: 6,
                      background: o.is_correct ? '#d1fae5' : '#f8fafc',
                      color: o.is_correct ? '#065f46' : '#475569',
                      fontWeight: o.is_correct ? 600 : 400,
                      border: `1px solid ${o.is_correct ? '#6ee7b7' : '#e2e8f0'}`,
                    }}>
                      {o.is_correct ? '✓ ' : ''}{o.text}
                    </div>
                  ))}
                </div>
                {d.explanation && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#4338ca', background: '#eef2ff', padding: '6px 10px', borderRadius: 6 }}>
                    💡 {d.explanation}
                  </div>
                )}
                <div className="draft-question-actions">
                  <button className="btn-approve" onClick={() => handleApprove(d, i)} disabled={approving[i] || msg?.ok}>
                    {approving[i] ? 'Adding…' : msg?.ok ? '✓ Added' : '✓ Approve & Add'}
                  </button>
                  <button className="btn-reject" onClick={() => handleReject(d, i)} disabled={approving[i] || msg?.ok}>
                    ✗ Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main AssessmentManager ────────────────────────────────────────────────────
export default function AssessmentManager() {
  const { driveId, roundId } = useParams()
  const { profile } = useAuth()

  const [assessment, setAssessment] = useState(undefined)
  const [questions, setQuestions] = useState([])
  const [companyId, setCompanyId] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('questions')
  const [toggling, setToggling] = useState(false)

  const loadAssessment = useCallback(async () => {
    try {
      const a = await getAssessmentByRound(roundId)
      setAssessment(a ?? null)
      if (a) {
        const qs = await getAssessmentQuestions(a.id)
        setQuestions(qs)
      }
    } catch (e) {
      setError(e.message)
    }
  }, [roundId])

  useEffect(() => {
    let live = true
    async function init() {
      setLoading(true)
      try {
        // Get company id
        const { data: co } = await supabase.from('companies').select('id').eq('profile_id', profile.id).single()
        if (!live) return
        setCompanyId(co?.id)
        // Get round info
        const { data: rd } = await supabase.from('drive_rounds').select('id, name, round_number, round_type').eq('id', roundId).single()
        if (live) setRoundInfo(rd)
        await loadAssessment()
      } catch (e) {
        if (live) setError(e.message)
      } finally {
        if (live) setLoading(false)
      }
    }
    init()
    return () => { live = false }
  }, [profile.id, roundId, loadAssessment])

  const handleToggleActive = async () => {
    if (!assessment) return
    setToggling(true)
    try {
      const updated = assessment.is_active
        ? await deactivateAssessment(assessment.id)
        : await activateAssessment(assessment.id)
      setAssessment(updated)
    } catch (e) {
      setError(e.message)
    } finally {
      setToggling(false)
    }
  }

  const handleRemoveQuestion = async (questionId) => {
    if (!window.confirm('Remove this question from the assessment?')) return
    try {
      await removeQuestionFromAssessment(assessment.id, questionId)
      await loadAssessment()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="page-state"><div className="loading-spinner" /></div>
  if (error) return <div className="alert error" style={{ margin: 20 }}>{error}</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="eyebrow">
            {roundInfo ? `Round ${roundInfo.round_number} — ${ROUND_TYPE_LABELS[roundInfo.round_type] || roundInfo.round_type}` : 'Assessment Manager'}
          </span>
          <h2>{roundInfo?.name || 'Assessment Manager'}</h2>
          <p>Configure the test for this recruitment round.</p>
        </div>
        <Link to={`/company/drives/${driveId}`} className="secondary-button">← Back to Drive</Link>
      </div>

      {assessment == null ? (
        <CreateAssessmentForm driveRoundId={roundId} onCreated={a => { setAssessment(a); setQuestions([]) }} />
      ) : (
        <div>
          {/* Status bar */}
          <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div className="assessment-status-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: assessment.is_active ? '#059669' : '#94a3b8', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 15 }}>{assessment.title}</strong>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {assessment.duration_minutes} min · {questions.length} questions · Max: {assessment.max_score ?? '—'} marks
                {assessment.passing_score != null && ` · Pass: ${assessment.passing_score}`}
                {assessment.negative_marking && ` · Negative marking (−${assessment.negative_fraction})`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className={assessment.is_active ? 'btn-danger' : 'primary-button'}
                onClick={handleToggleActive}
                disabled={toggling}
              >
                {toggling ? 'Updating…' : assessment.is_active ? 'Deactivate' : '▶ Activate'}
              </button>
            </div>
          </div>

          {assessment.is_active && (
            <div className="alert success" style={{ marginBottom: 12 }}>
              ✓ Assessment is ACTIVE — students with PENDING round status can start this test.
            </div>
          )}

          {/* Tabs */}
          <div className="tab-bar">
            {[['questions', 'Questions'], ['add', 'Add Question'], ['ai', '✨ AI Generate']].map(([id, label]) => (
              <button key={id} className={`tab-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {/* Questions list */}
          {tab === 'questions' && (
            <div>
              {questions.length === 0 ? (
                <p className="empty-copy">No questions yet. Add questions manually or use AI generation.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {questions.map((q, qi) => (
                    <div key={q.id} className="panel" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 18px' }}>
                      <div style={{ width: 28, height: 28, background: '#4f46e5', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {qi + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>{q.question_text}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {q.ai_generated && <span className="badge badge-ai">AI</span>}
                          <span style={{ fontSize: 11, color: DIFFICULTY_COLORS[q.difficulty] || '#64748b', fontWeight: 700 }}>{q.difficulty}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{q.topic}</span>
                          <span style={{ fontSize: 11, color: '#4f46e5', fontWeight: 700 }}>{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <button className="btn-danger btn-xs" onClick={() => handleRemoveQuestion(q.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'add' && companyId && (
            <AddQuestionForm
              assessmentId={assessment.id}
              onAdded={loadAssessment}
            />
          )}

          {tab === 'ai' && companyId && (
            <AiGenerator
              companyId={companyId}
              assessmentId={assessment.id}
              roundType={roundInfo?.round_type}
              onDraftsCreated={loadAssessment}
            />
          )}
        </div>
      )}
    </div>
  )
}
