import { useState } from 'react'
import { LogoMark } from '../brand/Logo'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, Briefcase, ClipboardList, FileCheck,
  ShieldCheck, Settings, LogOut, Users, BarChart3,
  AlertTriangle, BookOpen, Code2, Zap, Award, UserCheck,
  Building2, Bell, Menu, X,
} from 'lucide-react'

const navConfig = {
  student: [
    { label: 'Dashboard',       to: '/student',              icon: LayoutDashboard, end: true },
    { label: 'Applications',    to: '/student/applications', icon: ClipboardList },
    { label: 'Active Tests',    to: '/student/tests',        icon: Zap },
    { label: 'My Results',      to: '/student/results',      icon: Award },
  ],
  company: [
    { label: 'Dashboard',       to: '/company',              icon: LayoutDashboard, end: true },
    { label: 'Candidates',      to: '/company/candidates',   icon: Users },
    { label: 'Assessments',     to: '/company/drives',       icon: FileCheck },
    { label: 'Analytics',       to: '/company/analytics',    icon: BarChart3 },
    { label: 'Question Bank',   to: '/company/question-bank', icon: BookOpen },
  ],
  coordinator: [
    { label: 'Candidate Pool',  to: '/coordinator',           icon: Users, end: true },
    { label: 'Proposals',       to: '/coordinator/proposals', icon: ClipboardList },
    { label: 'Analytics',       to: '/coordinator/analytics', icon: BarChart3 },
  ],
  tnp_head: [
    { label: 'Integrity Hub',   to: '/tnp',                  icon: ShieldCheck, end: true },
    { label: 'Approvals',       to: '/tnp/approvals',        icon: FileCheck },
    { label: 'Change Requests', to: '/tnp/change-requests',  icon: AlertTriangle },
    { label: 'Shortlists',      to: '/tnp/shortlists',       icon: Award },
    { label: 'Audit Log',       to: '/tnp/audit',            icon: Code2 },
  ],
  admin: [
    { label: 'Users & System',  to: '/admin',                icon: Users, end: true },
    { label: 'Change Requests', to: '/admin/change-requests', icon: ClipboardList },
  ],
}


const roleLabel = {
  student:     'Student Portal',
  company:     'Recruiter Portal',
  coordinator: 'Coordinator',
  tnp_head:    'T&P Head',
  admin:       'Administrator',
}

const companyName = {
  student:     null,
  company:     'Company',
  coordinator: 'Placement Cell',
  tnp_head:    'Placement Cell',
  admin:       'PlaceGuard Admin',
}

export default function AppShell({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const links = navConfig[profile?.role] ?? []
  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (profile?.role?.[0] ?? '?').toUpperCase()

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="app-layout">
      {/* ── Mobile hamburger ── */}
      <button
        className="sidebar-hamburger"
        onClick={() => setSidebarOpen(v => !v)}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 99, backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <LogoMark size={30} />
          <div>
            <div className="sidebar-logo-text">PlaceGuard</div>
            <div className="sidebar-logo-sub">{roleLabel[profile?.role] ?? 'Portal'}</div>
          </div>
        </div>

        {/* Company/role block (for non-students) */}
        {profile?.role !== 'student' && (
          <div className="sidebar-company-block">
            <div className="sidebar-company-dot" />
            <div>
              <div className="sidebar-company-name">
                {profile?.role === 'company'
                  ? (profile?.name || 'Company')
                  : (companyName[profile?.role] ?? 'Institution')}
              </div>
              <div className="sidebar-company-status">Verified</div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Navigation</span>
          {links.map(({ label, to, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={closeSidebar}
              className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
            >
              {Icon && <Icon size={15} className="sidebar-nav-icon" />}
              <span style={{ flex: 1 }}>{label}</span>
              {badge && <span className="sidebar-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{profile?.name || 'User'}</div>
            <div className="sidebar-user-role">{roleLabel[profile?.role] ?? profile?.role}</div>
          </div>
          <button className="sidebar-signout" onClick={handleSignOut} title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="content-area">
        <div className="page-body animate-fadein">
          {children}
        </div>
      </div>
    </div>
  )
}
