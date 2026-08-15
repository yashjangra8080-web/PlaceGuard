import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_CFG = {
  PENDING:  { label: 'Pending Review', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  APPROVED: { label: 'Approved',       color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  REJECTED: { label: 'Rejected',       color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  APPLIED:  { label: 'Applied',        color: '#4f46e5', bg: 'rgba(79,70,229,0.1)' },
}

export default function TnpShortlists() {
  const [proposals, setProposals] = useState(null)
  const [error, setError]         = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const { data, error: qErr } = await supabase
          .from('shortlist_proposals')
          .select(`
            id,
            action,
            status,
            reason,
            created_at,
            reviewed_at,
            drives(id, title, role_name, companies(company_name)),
            students(id, profiles(name, email)),
            coordinator:profiles!shortlist_proposals_coordinator_id_fkey(name)
          `)
          .order('created_at', { ascending: false })
        if (qErr) throw qErr
        if (live) setProposals(data ?? [])
      } catch (err) {
        if (live) setError(err.message)
      }
    }
    load()
    return () => { live = false }
  }, [])

  const filtered = proposals === null
    ? null
    : filterStatus === 'all'
    ? proposals
    : proposals.filter(p => p.status === filterStatus)

  const counts = proposals
    ? Object.fromEntries(['PENDING','APPROVED','REJECTED','APPLIED'].map(s => [s, proposals.filter(p => p.status === s).length]))
    : {}

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">T&P HEAD</span>
          <h2>Shortlist Proposals</h2>
          <p>Review and manage all shortlist proposals from coordinators across active drives.</p>
        </div>
      </div>

      {/* KPI row */}
      {proposals && (
        <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
          {[
            { label: 'Pending', value: counts.PENDING ?? 0, color: '#d97706' },
            { label: 'Approved', value: counts.APPROVED ?? 0, color: '#16a34a' },
            { label: 'Rejected', value: counts.REJECTED ?? 0, color: '#dc2626' },
            { label: 'Applied', value: counts.APPLIED ?? 0, color: '#4f46e5' },
          ].map(k => (
            <article key={k.label} className="kpi" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {k.label}
              </div>
              <strong style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</strong>
            </article>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['all', 'PENDING', 'APPROVED', 'REJECTED', 'APPLIED'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${filterStatus === s ? 'var(--accent)' : 'var(--border)'}`,
              background: filterStatus === s ? 'var(--accent-light)' : 'transparent',
              color: filterStatus === s ? 'var(--accent-mid)' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {s === 'all' ? 'All' : (STATUS_CFG[s]?.label ?? s)}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {filtered === null ? (
        <div className="page-state"><div className="loading-spinner" /><span>Loading proposals…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No proposals found</div>
          <div className="empty-state-sub">Coordinator shortlist proposals will appear here.</div>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Drive</th>
                <th>Company</th>
                <th>Action</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Proposed</th>
                <th>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const cfg = STATUS_CFG[p.status] ?? { label: p.status, color: '#64748b', bg: 'transparent' }
                const studentName = p.students?.profiles?.name ?? '—'
                const studentEmail = p.students?.profiles?.email ?? ''
                const drive = p.drives
                const company = drive?.companies?.company_name ?? '—'
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{studentName}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{studentEmail}</div>
                    </td>
                    <td>
                      <Link to={`/tnp/drives/${drive?.id}`} style={{ color: 'var(--accent-mid)', fontSize: 12.5, fontWeight: 500 }}>
                        {drive?.title ?? '—'}
                      </Link>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{drive?.role_name}</div>
                    </td>
                    <td><span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{company}</span></td>
                    <td>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
                        color: p.action === 'ADD' ? '#16a34a' : '#dc2626',
                        background: p.action === 'ADD' ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                        padding: '2px 7px', borderRadius: 4,
                      }}>{p.action}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.reason ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 4 }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td><span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{fmt(p.created_at)}</span></td>
                    <td><span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{fmt(p.reviewed_at)}</span></td>
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
