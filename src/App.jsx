import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppShell from './components/layout/AppShell'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'

// Eager imports for core pages
import StudentDashboard from './pages/student/StudentDashboard'
import MyApplications from './pages/student/MyApplications'
import CompanyDashboard from './pages/company/CompanyDashboard'
import DriveDetail from './pages/company/DriveDetail'
import CoordinatorDashboard from './pages/coordinator/CoordinatorDashboard'
import Proposals from './pages/coordinator/Proposals'
import TnpDashboard from './pages/tnp/TnpDashboard'
import Approvals from './pages/tnp/Approvals'
import AdminDashboard from './pages/admin/AdminDashboard'

// Lazy-load pages (code-split)
const TestPage           = lazy(() => import('./pages/student/TestPage'))
const ResultPage         = lazy(() => import('./pages/student/ResultPage'))
const CodingTestPage     = lazy(() => import('./pages/student/CodingTestPage'))
const StudentTests       = lazy(() => import('./pages/student/StudentTests'))
const StudentResults     = lazy(() => import('./pages/student/StudentResults'))
const AssessmentManager  = lazy(() => import('./pages/company/AssessmentManager'))
const CompanyCandidates  = lazy(() => import('./pages/company/CompanyCandidates'))
const CompanyAnalytics   = lazy(() => import('./pages/company/CompanyAnalytics'))
const CompanyQuestionBank = lazy(() => import('./pages/company/CompanyQuestionBank'))
const CoordinatorAnalytics = lazy(() => import('./pages/coordinator/CoordinatorAnalytics'))
const ChangeRequests     = lazy(() => import('./pages/tnp/ChangeRequests'))
const TnpShortlists      = lazy(() => import('./pages/tnp/TnpShortlists'))
const TnpAudit           = lazy(() => import('./pages/tnp/TnpAudit'))
const AdminChangeForm    = lazy(() => import('./pages/admin/AdminChangeRequests'))

const Spinner = () => (
  <div className="page-state">
    <div className="loading-spinner" />
    <span>Loading…</span>
  </div>
)

function HomeRedirect() {
  const { profile, session, loading } = useAuth()
  if (loading) return <div className="page-state"><div className="loading-spinner" /></div>
  if (!session) return <LandingPage />
  if (!profile) return <div className="page-state">Checking account…</div>
  return <Navigate to={`/${profile.role === 'tnp_head' ? 'tnp' : profile.role}`} replace />
}

function Shell({ children }) {
  return <AppShell>{children}</AppShell>
}

// Full-screen test pages — no sidebar
function TestShell({ children }) {
  return (
    <Suspense fallback={<Spinner />}>
      {children}
    </Suspense>
  )
}

function LazyShell({ children }) {
  return (
    <Shell>
      <Suspense fallback={<Spinner />}>
        {children}
      </Suspense>
    </Shell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        {/* ── Student ───────────────────────────────────────── */}
        <Route path="/student" element={
          <ProtectedRoute roles={['student']}><Shell><StudentDashboard /></Shell></ProtectedRoute>
        } />
        <Route path="/student/applications" element={
          <ProtectedRoute roles={['student']}><Shell><MyApplications /></Shell></ProtectedRoute>
        } />
        <Route path="/student/tests" element={
          <ProtectedRoute roles={['student']}>
            <LazyShell><StudentTests /></LazyShell>
          </ProtectedRoute>
        } />
        <Route path="/student/results" element={
          <ProtectedRoute roles={['student']}>
            <LazyShell><StudentResults /></LazyShell>
          </ProtectedRoute>
        } />
        {/* Full-screen test — no sidebar */}
        <Route path="/student/test/:assessmentId" element={
          <ProtectedRoute roles={['student']}>
            <TestShell><TestPage /></TestShell>
          </ProtectedRoute>
        } />
        <Route path="/student/test/:assessmentId/result/:attemptId" element={
          <ProtectedRoute roles={['student']}>
            <Shell><Suspense fallback={<Spinner />}><ResultPage /></Suspense></Shell>
          </ProtectedRoute>
        } />
        <Route path="/student/coding/:assessmentId" element={
          <ProtectedRoute roles={['student']}>
            <TestShell><CodingTestPage /></TestShell>
          </ProtectedRoute>
        } />

        {/* ── Company ───────────────────────────────────────── */}
        <Route path="/company" element={
          <ProtectedRoute roles={['company']}><Shell><CompanyDashboard /></Shell></ProtectedRoute>
        } />
        <Route path="/company/drives/:driveId" element={
          <ProtectedRoute roles={['company']}><Shell><DriveDetail /></Shell></ProtectedRoute>
        } />
        <Route path="/company/drives/:driveId/assessment/:roundId" element={
          <ProtectedRoute roles={['company']}>
            <LazyShell><AssessmentManager /></LazyShell>
          </ProtectedRoute>
        } />
        <Route path="/company/candidates" element={
          <ProtectedRoute roles={['company']}>
            <LazyShell><CompanyCandidates /></LazyShell>
          </ProtectedRoute>
        } />
        <Route path="/company/analytics" element={
          <ProtectedRoute roles={['company']}>
            <LazyShell><CompanyAnalytics /></LazyShell>
          </ProtectedRoute>
        } />
        <Route path="/company/question-bank" element={
          <ProtectedRoute roles={['company']}>
            <LazyShell><CompanyQuestionBank /></LazyShell>
          </ProtectedRoute>
        } />

        {/* ── Coordinator ───────────────────────────────────── */}
        <Route path="/coordinator" element={
          <ProtectedRoute roles={['coordinator']}><Shell><CoordinatorDashboard /></Shell></ProtectedRoute>
        } />
        <Route path="/coordinator/proposals" element={
          <ProtectedRoute roles={['coordinator']}><Shell><Proposals /></Shell></ProtectedRoute>
        } />
        <Route path="/coordinator/analytics" element={
          <ProtectedRoute roles={['coordinator']}>
            <LazyShell><CoordinatorAnalytics /></LazyShell>
          </ProtectedRoute>
        } />

        {/* ── T&P Head ──────────────────────────────────────── */}
        <Route path="/tnp" element={
          <ProtectedRoute roles={['tnp_head']}><Shell><TnpDashboard /></Shell></ProtectedRoute>
        } />
        <Route path="/tnp/approvals" element={
          <ProtectedRoute roles={['tnp_head']}><Shell><Approvals /></Shell></ProtectedRoute>
        } />
        <Route path="/tnp/drives/:driveId" element={
          <ProtectedRoute roles={['tnp_head']}><Shell><DriveDetail /></Shell></ProtectedRoute>
        } />
        <Route path="/tnp/change-requests" element={
          <ProtectedRoute roles={['tnp_head']}>
            <LazyShell><ChangeRequests /></LazyShell>
          </ProtectedRoute>
        } />
        <Route path="/tnp/shortlists" element={
          <ProtectedRoute roles={['tnp_head']}>
            <LazyShell><TnpShortlists /></LazyShell>
          </ProtectedRoute>
        } />
        <Route path="/tnp/audit" element={
          <ProtectedRoute roles={['tnp_head']}>
            <LazyShell><TnpAudit /></LazyShell>
          </ProtectedRoute>
        } />

        {/* ── Admin ─────────────────────────────────────────── */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin']}><Shell><AdminDashboard /></Shell></ProtectedRoute>
        } />
        <Route path="/admin/change-requests" element={
          <ProtectedRoute roles={['admin']}>
            <LazyShell><AdminChangeForm /></LazyShell>
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

