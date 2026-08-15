/**
 * PlaceGuard Logo — SVG brand component
 * variant="mark"       → compact shield icon only (sidebar, favicon context)
 * variant="horizontal" → shield + wordmark side-by-side (landing, login, nav)
 * variant="stacked"    → shield above wordmark
 */

const SHIELD_PATH = 'M12 2L3 6.5V11c0 5.25 3.75 10.2 9 11.4C17.25 21.2 21 16.25 21 11V6.5L12 2Z'
const CHECK_PATH  = 'M8.5 12.5l2.5 2.5 4.5-4.5'

export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PlaceGuard"
      role="img"
    >
      {/* Shield fill */}
      <path
        d={SHIELD_PATH}
        fill="#4F46E5"
        fillOpacity="0.15"
        stroke="#4F46E5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Inner shield highlight */}
      <path
        d="M12 4.5L5 8.2V11c0 4.1 2.9 7.95 7 9.05C16.1 18.95 19 15.1 19 11V8.2L12 4.5Z"
        fill="#4F46E5"
        fillOpacity="0.25"
      />
      {/* Checkmark */}
      <path
        d={CHECK_PATH}
        stroke="#818CF8"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LogoWordmark({ size = 'md', className = '', inverted = false }) {
  const sizes = {
    sm: { iconSize: 22, fontSize: 14, subSize: 8.5 },
    md: { iconSize: 28, fontSize: 17, subSize: 9 },
    lg: { iconSize: 36, fontSize: 22, subSize: 10 },
  }
  const s = sizes[size] ?? sizes.md
  const textColor = inverted ? '#0A1628' : '#F0F4F8'
  const subColor  = inverted ? '#334155' : '#64748B'

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 9, userSelect: 'none' }}
      aria-label="PlaceGuard"
    >
      <LogoMark size={s.iconSize} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{
          fontSize: s.fontSize,
          fontWeight: 800,
          color: textColor,
          letterSpacing: '-0.4px',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          PlaceGuard
        </span>
        <span style={{
          fontSize: s.subSize,
          fontWeight: 600,
          color: subColor,
          letterSpacing: '0.9px',
          textTransform: 'uppercase',
          marginTop: 2,
        }}>
          Placement Governance
        </span>
      </span>
    </span>
  )
}

/** Default export — shorthand for the wordmark */
export default LogoWordmark
