import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const nav = {
  student: [
    ['Overview', '/student'],
    ['My applications', '/student/applications'],
  ],
  company: [
    ['Drive overview', '/company'],
  ],
  coordinator: [
    ['Candidate pool', '/coordinator'],
    ['My proposals', '/coordinator/proposals'],
  ],
  tnp_head: [
    ['Integrity dashboard', '/tnp'],
    ['Approvals', '/tnp/approvals'],
  ],
  admin: [
    ['Administration', '/admin'],
  ],
}

export default function AppShell({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const exit = async () => { await signOut(); navigate('/') }
  const links = nav[profile?.role] ?? []

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" to="/">PLACE<span>GUARD</span></Link>
        <p className="role-label">{profile?.role?.replace('_', ' ')}</p>
        <nav>
          {links.map(([label, to]) => (
            <NavLink key={label} to={to} end>{label}</NavLink>
          ))}
        </nav>
        <button className="quiet-button" onClick={exit}>Sign out</button>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">SECURE PLACEMENT GOVERNANCE</span>
            <h1>Welcome back, {profile?.name || 'member'}</h1>
          </div>
          <span className="status ok">Account active</span>
        </header>
        {children}
      </main>
    </div>
  )
}
