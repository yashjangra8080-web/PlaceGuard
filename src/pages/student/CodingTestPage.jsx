import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { startTestAttempt, getCodingProblem, submitCodingAttempt, getCodingSubmission } from '../../services/assessments'
import { supabase } from '../../lib/supabase'

const LANG_LABELS = { python: 'Python 3', java: 'Java 17', cpp: 'C++ 17', javascript: 'JavaScript' }

const CODE_TEMPLATES = {
  python: '# Write your solution here\n\ndef solution():\n    pass\n',
  java: 'public class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
  javascript: '// Write your solution here\nfunction solution() {\n\n}\n',
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-secondary)', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function CodeBlock({ children, accent }) {
  return (
    <pre style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5,
      color: accent ? 'var(--accent-mid)' : 'var(--text-primary)',
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)',
      borderRadius: 8, padding: '10px 14px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {children}
    </pre>
  )
}

export default function CodingTestPage() {
  const { assessmentId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [problem, setProblem]       = useState(null)
  const [attempt, setAttempt]       = useState(null)
  const [submission, setSubmission] = useState(null)
  const [code, setCode]             = useState(CODE_TEMPLATES.python)
  const [lang, setLang]             = useState('python')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [busy, setBusy]             = useState(false)
  const [msg, setMsg]               = useState(null)  // { type: 'error'|'info', text }

  const bootstrap = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // 1. Verify assessment is active
      const { data: asmt, error: aErr } = await supabase
        .from('assessments')
        .select('id, title, is_active')
        .eq('id', assessmentId)
        .single()
      if (aErr) throw aErr
      if (!asmt.is_active) throw new Error('This assessment is not yet active.')

      // 2. Load the coding problem
      const prob = await getCodingProblem(assessmentId)
      if (!prob) throw new Error('No coding problem has been configured for this round yet. Please check back later.')
      setProblem(prob)
      const defaultLang = prob.allowed_languages?.[0] ?? 'python'
      setLang(defaultLang)

      // 3. Check / start attempt
      const { data: existing } = await supabase
        .from('test_attempts')
        .select('id, status')
        .eq('assessment_id', assessmentId)
        .eq('student_profile_id', profile.id)
        .maybeSingle()

      let attemptId
      if (existing) {
        setAttempt(existing); attemptId = existing.id
      } else {
        const newAttempt = await startTestAttempt(assessmentId)
        if (!newAttempt?.attempt_id) throw new Error('Could not start coding attempt.')
        const a = { id: newAttempt.attempt_id, status: 'IN_PROGRESS' }
        setAttempt(a); attemptId = newAttempt.attempt_id
      }

      // 4. Load existing submission if any
      const sub = await getCodingSubmission(attemptId)
      if (sub) {
        setSubmission(sub)
        setCode(sub.source_code ?? CODE_TEMPLATES[defaultLang] ?? '')
        setLang(sub.language ?? defaultLang)
      } else {
        setCode(CODE_TEMPLATES[defaultLang] ?? '')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [assessmentId, profile.id])

  useEffect(() => { bootstrap() }, [bootstrap])

  const handleLangChange = (newLang) => {
    if (submission) return  // locked after submit
    if (code === CODE_TEMPLATES[lang] || !code.trim()) setCode(CODE_TEMPLATES[newLang] ?? '')
    setLang(newLang)
  }

  const handleSubmit = async () => {
    if (!attempt?.id || !problem?.id) return
    if (!code.trim()) { setMsg({ type: 'error', text: 'Please write some code before submitting.' }); return }
    setBusy(true); setMsg(null)
    try {
      const sub = await submitCodingAttempt({
        attemptId: attempt.id,
        problemId: problem.id,
        language: lang,
        sourceCode: code,
      })
      setSubmission(sub)
      setMsg({
        type: 'info',
        text: 'Submission recorded. Judge0 execution is pending configuration — your code is saved and will be evaluated once the execution engine is enabled. Your attempt is marked for review.',
      })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const allowedLangs = problem?.allowed_languages ?? ['python', 'java', 'cpp']
  const alreadySubmitted = !!submission

  if (loading) return (
    <div className="page-state">
      <div className="loading-spinner" />
      <span>Loading coding assessment…</span>
    </div>
  )

  if (error) return (
    <div style={{ padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>
      <button className="secondary-button" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  )

  return (
    <div className="coding-layout">

      {/* Header */}
      <div className="coding-header">
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>
          {problem.title}
        </div>
        <div style={{ flex: 1 }} />
        <select
          value={lang}
          onChange={e => handleLangChange(e.target.value)}
          disabled={alreadySubmitted}
          style={{ background: '#0f2035', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: alreadySubmitted ? 'not-allowed' : 'pointer' }}
        >
          {allowedLangs.map(l => <option key={l} value={l}>{LANG_LABELS[l] ?? l}</option>)}
        </select>
        {!alreadySubmitted && (
          <button className="primary-button btn-sm" style={{ marginLeft: 12 }} disabled={busy} onClick={handleSubmit}>
            {busy ? 'Submitting…' : 'Submit Code'}
          </button>
        )}
        <button className="btn-ghost" style={{ color: 'var(--text-secondary)', marginLeft: 8 }} onClick={() => navigate(-1)}>Exit</button>
      </div>

      {/* Execution engine notice */}
      <div style={{ background: 'rgba(245,158,11,0.07)', borderBottom: '1px solid var(--warning-border)', padding: '7px 20px', fontSize: 12, color: 'var(--warning)', display: 'flex', gap: 8 }}>
        <strong>Execution Engine:</strong>
        Judge0 integration pending. Submissions are stored for audit; automated scoring will activate once Judge0 is configured.
      </div>

      <div className="coding-panels">

        {/* Problem panel */}
        <div className="coding-problem">
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>{problem.title}</h3>

          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 20 }}>
            {problem.problem_statement}
          </div>

          {problem.constraints_text ? (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Constraints</SectionLabel>
              <CodeBlock>{problem.constraints_text}</CodeBlock>
            </div>
          ) : null}

          {problem.input_format ? (
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>Input Format</SectionLabel>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{problem.input_format}</div>
            </div>
          ) : null}

          {problem.output_format ? (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Output Format</SectionLabel>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{problem.output_format}</div>
            </div>
          ) : null}

          {problem.sample_input ? (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel>Sample Input</SectionLabel>
              <CodeBlock>{problem.sample_input}</CodeBlock>
            </div>
          ) : null}

          {problem.sample_output ? (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Sample Output</SectionLabel>
              <CodeBlock accent>{problem.sample_output}</CodeBlock>
            </div>
          ) : null}

          {alreadySubmitted && (
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 10, padding: '12px 16px' }}>
              <SectionLabel>Submission Recorded</SectionLabel>
              <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600, marginBottom: 4 }}>
                Language: {LANG_LABELS[submission.language] ?? submission.language}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Status: <strong style={{ color: 'var(--warning)' }}>{submission.execution_status}</strong>
              </div>
              {submission.submitted_at && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {new Date(submission.submitted_at).toLocaleString('en-IN')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Editor panel */}
        <div className="coding-editor-area">
          <div className="coding-editor-bar">
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Solution — {LANG_LABELS[lang] ?? lang}
              {alreadySubmitted && <span style={{ marginLeft: 8, color: 'var(--warning)', fontWeight: 600 }}> · submitted (read-only)</span>}
            </span>
          </div>
          <div className="code-editor-wrap">
            <textarea
              className="code-editor-plain"
              value={code}
              onChange={e => !alreadySubmitted && setCode(e.target.value)}
              readOnly={alreadySubmitted}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              style={alreadySubmitted ? { opacity: 0.65, cursor: 'default' } : {}}
            />
          </div>
          <div className="coding-output">
            {msg ? (
              <div style={{ color: msg.type === 'error' ? 'var(--danger)' : 'var(--info)', fontSize: 12.5, lineHeight: 1.6 }}>{msg.text}</div>
            ) : (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12.5 }}>
                {alreadySubmitted ? 'Code submitted. Awaiting evaluation.' : 'Write your solution and click Submit Code when ready.'}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
