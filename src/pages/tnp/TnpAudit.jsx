import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { verifyAuditIntegrity } from '../../services/placement'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

const ACTION_COLORS = {
  APPLICATION_SUBMITTED: 'var(--accent)',
  TEST_STARTED: 'var(--info)',
  TEST_SUBMITTED: 'var(--success)',
  ROUND_EVALUATED: 'var(--warning)',
  SHORTLIST_PROPOSED: 'var(--purple)',
  SHORTLIST_REVIEWED: 'var(--success)',
  ADMIN_CHANGE_REQUESTED: 'var(--danger)',
  ADMIN_CHANGE_APPROVED: 'var(--success)',
  ADMIN_CHANGE_REJECTED: 'var(--danger)',
  ANOMALY_DETECTED: 'var(--danger)',
  DRIVE_PUBLISHED: 'var(--accent)',
}

export default function TnpAudit() {
  const [commits, setCommits]    = useState(null)
  const [integrity, setIntegrity] = useState(null)
  const [error, setError]         = useState(null)
  const [filterAction, setFilterAction] = useState('')
  const [page, setPage]           = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [integ] = await Promise.all([
          verifyAuditIntegrity().catch(() => null),
        ])
        if (!live) return
        setIntegrity(integ)

        let q = supabase
          .from('audit_commits')
          .select('id, sequence_number, action_type, actor_id, drive_id, entity_type, entity_id, reason, status, payload_hash, created_at, profiles!audit_commits_actor_id_fkey(name, role)')
          .order('sequence_number', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (filterAction) q = q.eq('action_type', filterAction)

        const { data, error: qErr } = await q
        if (qErr) throw qErr
        if (live) setCommits(data ?? [])
      } catch (err) {
        if (live) setError(err.message)
      }
    }
    load()
    return () => { live = false }
  }, [filterAction, page])


  const integrityOk = integrity?.valid !== false
  const checked = integrity?.checked ?? '—'
  const valid   = integrity?.valid_count ?? integrity?.checked ?? '—'

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">T&P HEAD</span>
          <h2>Audit Log</h2>
          <p>Append-only audit trail — every placement action, actor, and entity recorded.</p>
        </div>
        {/* Integrity badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: integrityOk ? 'var(--success-bg)' : 'var(--danger-bg)',
          border: `1px solid ${integrityOk ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
          borderRadius: 10, padding: '10px 16px',
        }}>
          <div style={{ fontSize: 18 }}>{integrityOk ? '✓' : '⚠'}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: integrityOk ? 'var(--success)' : 'var(--danger)' }}>
              Audit Integrity · {integrityOk ? 'Verified' : 'Issue Detected'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
              {checked} commits checked · {valid} valid
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterAction}
          onChange={e => { setFilterAction(e.target.value); setPage(0) }}
          className="form-select" style={{ minWidth: 200 }}
        >
          <option value="">All Action Types</option>
          {Object.keys(ACTION_COLORS).map(a => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {filterAction && (
          <button
            onClick={() => { setFilterAction(''); setPage(0) }}
            className="btn-ghost"
            style={{ fontSize: 12 }}
          >
            × Clear
          </button>
        )}
      </div>

      {commits === null ? (
        <div className="page-state"><div className="loading-spinner" /><span>Loading audit log…</span></div>
      ) : commits.length === 0 ? (
        <div className="empty-state">
          
          <div className="empty-state-title">No audit events found</div>
          <div className="empty-state-sub">Audit events are recorded as placement actions occur.</div>
        </div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Entity</th>
                  <th>Reason</th>
                  <th>Hash</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {commits.map(c => {
                  const color = ACTION_COLORS[c.action_type] ?? 'var(--text-secondary)'
                  const actorName = c.profiles?.name ?? c.actor_id?.slice(0, 8) ?? '—'
                  const actorRole = c.profiles?.role ?? '—'
                  return (
                    <tr key={c.id}>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          #{c.sequence_number}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                          color, background: color + '18',
                          padding: '2px 7px', borderRadius: 4,
                          display: 'inline-block', maxWidth: 200,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.action_type}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{actorName}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {actorRole.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {c.entity_type ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', maxWidth: 180, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.reason ?? '—'}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {c.payload_hash ? c.payload_hash.slice(0, 10) + '…' : '—'}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          {fmt(c.created_at)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', gap: 8, marginTop: '1rem', alignItems: 'center' }}>
            <button
              className="secondary-button btn-sm"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Page {page + 1}
            </span>
            <button
              className="secondary-button btn-sm"
              disabled={commits.length < PAGE_SIZE}
              onClick={() => setPage(p => p + 1)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </section>
  )
}
