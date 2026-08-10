import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const nav = { student: [['Overview', '/student'], ['My applications', '/student']], company: [['Drive overview', '/company'], ['Audit trail', '/company']], coordinator: [['Candidate pool', '/coordinator'], ['Proposals', '/coordinator']], tnp_head: [['Integrity dashboard', '/tnp'], ['Approvals', '/tnp']], admin: [['Administration', '/admin'], ['Access requests', '/admin']] }
export default function AppShell({ children }) {
  const { profile, signOut } = useAuth(); const navigate = useNavigate()
  const exit = async () => { await signOut(); navigate('/') }
  return <div className="shell"><aside className="sidebar"><Link className="brand" to="/">PLACE<span>GUARD</span></Link><p className="role-label">{profile?.role?.replace('_', ' ')}</p><nav>{(nav[profile?.role] || []).map(([label, to]) => <NavLink key={label} to={to}>{label}</NavLink>)}</nav><button className="quiet-button" onClick={exit}>Sign out</button></aside><main className="main"><header className="topbar"><div><span className="eyebrow">SECURE PLACEMENT GOVERNANCE</span><h1>Welcome back, {profile?.name || 'member'}</h1></div><span className="status ok">Account active</span></header>{children}</main></div>
}
