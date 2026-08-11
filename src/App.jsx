import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppShell from './components/layout/AppShell'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import StudentDashboard from './pages/student/StudentDashboard'
import MyApplications from './pages/student/MyApplications'
import CompanyDashboard from './pages/company/CompanyDashboard'
import DriveDetail from './pages/company/DriveDetail'
import CoordinatorDashboard from './pages/coordinator/CoordinatorDashboard'
import Proposals from './pages/coordinator/Proposals'
import TnpDashboard from './pages/tnp/TnpDashboard'
import Approvals from './pages/tnp/Approvals'
import AdminDashboard from './pages/admin/AdminDashboard'

function HomeRedirect() {
  const { profile, session, loading } = useAuth()
  if (loading) return <div className="page-state">Loading PlaceGuard…</div>
  if (!session) return <LandingPage />
  if (!profile) return <div className="page-state">Checking account configuration…</div>
  return <Navigate to={`/${profile.role === 'tnp_head' ? 'tnp' : profile.role}`} replace />
}

function Shell({ children }) {
  return <AppShell>{children}</AppShell>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Student */}
        <Route path="/student" element={<ProtectedRoute roles={['student']}><Shell><StudentDashboard /></Shell></ProtectedRoute>} />
        <Route path="/student/applications" element={<ProtectedRoute roles={['student']}><Shell><MyApplications /></Shell></ProtectedRoute>} />

        {/* Company */}
        <Route path="/company" element={<ProtectedRoute roles={['company']}><Shell><CompanyDashboard /></Shell></ProtectedRoute>} />
        <Route path="/company/drives/:driveId" element={<ProtectedRoute roles={['company']}><Shell><DriveDetail /></Shell></ProtectedRoute>} />

        {/* Coordinator */}
        <Route path="/coordinator" element={<ProtectedRoute roles={['coordinator']}><Shell><CoordinatorDashboard /></Shell></ProtectedRoute>} />
        <Route path="/coordinator/proposals" element={<ProtectedRoute roles={['coordinator']}><Shell><Proposals /></Shell></ProtectedRoute>} />

        {/* T&P Head */}
        <Route path="/tnp" element={<ProtectedRoute roles={['tnp_head']}><Shell><TnpDashboard /></Shell></ProtectedRoute>} />
        <Route path="/tnp/approvals" element={<ProtectedRoute roles={['tnp_head']}><Shell><Approvals /></Shell></ProtectedRoute>} />
        <Route path="/tnp/drives/:driveId" element={<ProtectedRoute roles={['tnp_head']}><Shell><DriveDetail /></Shell></ProtectedRoute>} />

        {/* Admin */}
        <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Shell><AdminDashboard /></Shell></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
