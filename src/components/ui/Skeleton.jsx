/**
 * Skeleton loading components
 * Usage:
 *   <Skeleton variant="card" />
 *   <Skeleton variant="text" width="60%" />
 *   <SkeletonKpiGrid count={4} />
 *   <SkeletonTable rows={5} cols={4} />
 */
export function Skeleton({ variant = 'text', width, height, style = {}, className = '' }) {
  const cls = {
    text:  'skeleton skeleton-text',
    title: 'skeleton skeleton-title',
    card:  'skeleton skeleton-card',
    row:   'skeleton skeleton-row',
    kpi:   'skeleton skeleton-kpi',
  }
  return (
    <div
      className={`${cls[variant] ?? 'skeleton'} ${className}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}

export function SkeletonKpiGrid({ count = 4 }) {
  return (
    <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="kpi" />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} variant="text" style={{ height: 12, opacity: 0.5 }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} variant="text" style={{ opacity: 0.6 + i * 0.02 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton variant="title" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" style={{ width: i === lines - 1 ? '70%' : '100%' }} />
      ))}
    </div>
  )
}
