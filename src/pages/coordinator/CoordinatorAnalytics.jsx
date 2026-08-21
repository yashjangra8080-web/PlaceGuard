import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getPendingProposals } from '../../services/drives'

export default function CoordinatorAnalytics() {
  const [stats,     setStats]     = useState(null)
  const [proposals, setProposals] = useState([])
  const [error,     setError]     = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [
          { count: totalDrives },
          { count: totalApps },
          { count: totalSelected },
          { count: totalRejected },
          { count: pendingRounds },
          { count: passedRounds },
          { count: failedRounds },
          proposalList,
        ] = await Promise.all([
          supabase.from('drives').select('*', { count: 'exact', head: true }).in('status', ['open', 'closed']),
          supabase.from('applications').select('*', { count: 'exact', head: true }),
          supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'SELECTED'),
          supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'REJECTED'),
          supabase.from('application_rounds').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
          supabase.from('application_rounds').select('*', { count: 'exact', head: true }).eq('status', 'PASSED'),
          supabase.from('application_rounds').select('*', { count: 'exact', head: true }).eq('status', 'FAILED'),
          getPendingProposals(),
        ])

        if (!live) return
        setStats({
          totalDrives:   totalDrives   ?? 0,
          totalApps:     totalApps     ?? 0,
          totalSelected: totalSelected ?? 0,
          totalRejected: totalRejected ?? 0,
          pendingRounds: pendingRounds ?? 0,
          passedRounds:  passedRounds  ?? 0,
          failedRounds:  failedRounds  ?? 0,
        })
        setProposals(proposalList)
      } catch (err) {
        if (live) setError(err.message)
      }
    }
    load()
    return () => { live = false }
  }, [])


  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">COORDINATOR</span>
          <h2>Analytics</h2>
          <p>Placement activity overview — drives, candidates, round progression, proposals.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {stats === null ? (
        <div className="page-state"><div className="loading-spinner" /><span>Loading analytics…</span></div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
            {[
              { label: 'Active Drives',      value: stats.totalDrives,   color: 'var(--accent)' },
              { label: 'Total Applications', value: stats.totalApps,     color: 'var(--info)' },
              { label: 'Selected',           value: stats.totalSelected, color: 'var(--success)' },
              { label: 'Rejected',           value: stats.totalRejected, color: 'var(--danger)' },
            ].map(k => (
              <article key={k.label} className="kpi" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  {k.label}
                </div>
                <strong style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</strong>
              </article>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
            {/* Round progression */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: '1rem' }}>
                Round Progression
              </div>
              {[
                { label: 'Pending / Upcoming', value: stats.pendingRounds, color: 'var(--info)' },
                { label: 'Passed',             value: stats.passedRounds,  color: 'var(--success)' },
                { label: 'Failed',             value: stats.failedRounds,  color: 'var(--danger)' },
              ].map(r => {
                const total = (stats.pendingRounds ?? 0) + (stats.passedRounds ?? 0) + (stats.failedRounds ?? 0)
                const pct   = total > 0 ? Math.round((Number(r.value) / total) * 100) : 0
                return (
                  <div key={r.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--card-bg-2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: r.color, borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pending proposals */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: '1rem' }}>
                Pending Proposals ({proposals.length})
              </div>
              {proposals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-tertiary)', fontSize: 12.5 }}>
                  No pending proposals
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {proposals.slice(0, 6).map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {p.students?.profiles?.name ?? 'Student'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {p.drives?.title ?? '—'} · {p.action}
                        </div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-bg)', padding: '2px 7px', borderRadius: 4 }}>
                        Pending
                      </span>
                    </div>
                  ))}
                  {proposals.length > 6 && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', textAlign: 'center', paddingTop: 4 }}>
                      +{proposals.length - 6} more
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
