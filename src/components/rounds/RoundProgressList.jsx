// Round progress display shared between student and company views.
// studentView=true hides evaluator name and redacts locked feedback.

const STATUS_CONFIG = {
  LOCKED:       { label: 'Locked',        icon: '🔒', color: '#94a3b8' },
  PENDING:      { label: 'Upcoming',      icon: '⏳', color: '#0369a1' },
  PASSED:       { label: 'Passed',        icon: '✅', color: '#146647' },
  FAILED:       { label: 'Failed',        icon: '❌', color: '#a3322c' },
  ABSENT:       { label: 'Absent',        icon: '⚠️', color: '#7a5c00' },
  NOT_ATTEMPTED:{ label: 'Not Attempted', icon: '—',  color: '#637089' },
}

const TYPE_LABELS = {
  APTITUDE:            'Aptitude',
  CODING:              'Coding',
  SQL_ASSESSMENT:      'SQL + Python',
  LINUX_ASSESSMENT:    'Linux / Networking',
  CLOUD_ASSESSMENT:    'Cloud Assessment',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  HR_INTERVIEW:        'HR Interview',
  GROUP_DISCUSSION:    'Group Discussion',
  ASSESSMENT:          'Assessment',
  OTHER:               'Other',
}

export default function RoundProgressList({ rounds, studentView = true, onEvaluate, busy }) {
  if (!rounds || rounds.length === 0) {
    return <p className="empty-copy">No rounds configured for this drive.</p>
  }

  return (
    <ol className="round-list" aria-label="Recruitment rounds">
      {rounds.map((r) => {
        const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.LOCKED
        const isActive = r.status === 'PENDING'
        const isDone = ['PASSED','FAILED','ABSENT','NOT_ATTEMPTED'].includes(r.status)

        return (
          <li
            key={r.round_number ?? r.id}
            className={`round-item round-${r.status?.toLowerCase()}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <div className="round-left">
              <div className="round-number-badge" style={{ background: cfg.color + '22', color: cfg.color }}>
                {r.round_number}
              </div>
              <div className="round-info">
                <div className="round-name">
                  {r.name}
                  <span className="round-type-pill">{TYPE_LABELS[r.round_type] ?? r.round_type}</span>
                  {r.is_elimination && (
                    <span className="round-elim-badge" title="Elimination round">Elim</span>
                  )}
                </div>
                {r.description && (
                  <p className="round-desc">{r.description}</p>
                )}
                {isDone && r.feedback && (
                  <p className="round-feedback">💬 {r.feedback}</p>
                )}
                {isDone && r.score != null && (
                  <span className="round-score">
                    Score: <strong>{r.score}</strong>
                    {r.max_score != null && <> / {r.max_score}</>}
                    {r.max_score != null && r.passing_score != null && (
                      <> · Pass threshold: {r.passing_score}</>
                    )}
                  </span>
                )}
                {!studentView && isDone && r.evaluated_by_name && (
                  <span className="round-evaluator">Evaluated by: {r.evaluated_by_name}</span>
                )}
              </div>
            </div>

            <div className="round-right">
              <span className="round-status-chip" style={{ color: cfg.color, background: cfg.color + '18' }}>
                {cfg.icon} {cfg.label}
              </span>
              {!studentView && r.status === 'PENDING' && onEvaluate && (
                <button
                  className="secondary-button"
                  style={{ fontSize: '.8rem', padding: '.3rem .75rem' }}
                  disabled={busy}
                  onClick={() => onEvaluate(r)}
                >
                  Evaluate
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
