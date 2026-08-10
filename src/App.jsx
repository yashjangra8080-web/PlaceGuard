import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppShell from './components/layout/AppShell'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
function HomeRedirect() { const { profile, session, loading } = useAuth(); if (loading) return <div className="page-state">Loading PlaceGuard…</div>; if (!session) return <LandingPage />; if (!profile) return <div className="page-state">Checking account configuration…</div>; return <Navigate to={`/${profile.role === 'tnp_head' ? 'tnp' : profile.role}`} replace /> }
function DashboardRoute({ role, path }) { return <Route path={path} element={<ProtectedRoute roles={[role]}><AppShell><DashboardPage /></AppShell></ProtectedRoute>} /> }
export default function App() { return <AuthProvider><Routes><Route path="/" element={<HomeRedirect />} /><Route path="/login" element={<LoginPage />} />{DashboardRoute({ role: 'student', path: '/student' })}{DashboardRoute({ role: 'company', path: '/company' })}{DashboardRoute({ role: 'coordinator', path: '/coordinator' })}{DashboardRoute({ role: 'tnp_head', path: '/tnp' })}{DashboardRoute({ role: 'admin', path: '/admin' })}<Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider> }
