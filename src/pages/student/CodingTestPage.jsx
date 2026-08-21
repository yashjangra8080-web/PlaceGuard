import { useState } from 'react'

// CodingTestPage — functional stub with code editor textarea.
// Full Judge0 execution can be enabled by configuring JUDGE0_API_URL as a Supabase secret
// and wiring the coding_submissions table + edge function.
export default function CodingTestPage() {
  const [code, setCode] = useState('# Write your solution here\n\ndef solution():\n    pass\n')
  const [lang, setLang] = useState('python')
  const [output, setOutput] = useState('')

  const LANGS = ['python', 'java', 'cpp']
  const unavailableMessage = 'PENDING_EXTERNAL_CONFIG: isolated Judge0 execution has not been configured. No code was executed or submitted.'

  return (
    <div className="coding-layout">
      {/* Header */}
      <div className="coding-header">
        <div style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>PlaceGuard — Coding Assessment</div>
        <div style={{ flex: 1 }} />
        <select
          value={lang}
          onChange={e => setLang(e.target.value)}
          style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '4px 10px', fontSize: 13 }}
        >
          {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button
          className="primary-button btn-sm"
          style={{ marginLeft: 12 }}
          onClick={() => {
            setOutput(unavailableMessage)
          }}
        >
          Run Code ▶
        </button>
        <button
          className="secondary-button btn-sm"
          style={{ marginLeft: 8, background: '#059669', color: 'white', border: 'none' }}
          onClick={() => {
            setOutput(unavailableMessage)
          }}
        >
          Submit
        </button>
        <button className="btn-ghost" style={{ color: '#94a3b8', marginLeft: 8 }} onClick={() => window.history.back()}>
          Exit
        </button>
      </div>

      <div className="coding-panels">
        {/* Problem panel */}
        <div className="coding-problem">
          <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <strong style={{ fontSize: 12, color: '#92400e' }}>ℹ️ Coding execution requires Judge0 API configuration.</strong>
            <div style={{ fontSize: 11.5, color: '#78350f', marginTop: 4 }}>
              This environment is intentionally disabled until an isolated Judge0 integration is configured. No code or result is recorded.
            </div>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Coding Problem</h3>
          <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.7, marginBottom: 16 }}>
            The problem statement for this round will appear here once the assessment is configured with a coding problem.
          </p>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Sample Input
            </div>
            <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#0f172a', margin: 0 }}>
              {'5\n1 2 3 4 5'}
            </pre>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Sample Output
            </div>
            <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#0f172a', margin: 0 }}>
              15
            </pre>
          </div>
        </div>

        {/* Editor */}
        <div className="coding-editor-area">
          <div className="coding-editor-bar">
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Solution — {lang}</span>
          </div>
          <div className="code-editor-wrap">
            <textarea
              className="code-editor-plain"
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>
          {/* Output */}
          <div className="coding-output">
            {output
              ? output.split('\n').map((line, i) => <div key={i}>{line || '\u00a0'}</div>)
              : <span style={{ color: '#475569' }}>Output will appear here after running…</span>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
