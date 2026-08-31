import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { MessagesProvider } from './context/MessagesContext'
import { AnnouncementsProvider } from './context/AnnouncementsContext'
import { LoanRequestsProvider } from './context/LoanRequestsContext'
import { InvoicesProvider } from './context/InvoicesContext'
import { DisbursementsProvider } from './context/DisbursementsContext'
import { NotificationsProvider } from './context/NotificationsContext'
import AppShell from './components/AppShell'
// Login is the unauthenticated landing page — keep it eager so first paint
// isn't gated on a second chunk fetch. Every other page is code-split so the
// initial bundle carries only the shell, router, and contexts.
import Login from './pages/Login'

const SetPassword = lazy(() => import('./pages/SetPassword'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))

const UserDashboard = lazy(() => import('./pages/user/UserDashboard'))
const LoanDetail = lazy(() => import('./pages/user/LoanDetail'))
const ConsolidatedLoans = lazy(() => import('./pages/user/ConsolidatedLoans'))
const StraightTransactions = lazy(() => import('./pages/user/StraightTransactions'))
const Payments = lazy(() => import('./pages/user/Payments'))
const UserPaymentLogs = lazy(() => import('./pages/user/PaymentLogs'))
const UserMessages = lazy(() => import('./pages/user/Messages'))
const AnnouncementDetail = lazy(() => import('./pages/user/AnnouncementDetail'))
const LoanRequest = lazy(() => import('./pages/user/LoanRequest'))
const UserInvoices = lazy(() => import('./pages/user/Invoices'))
const UserDisbursements = lazy(() => import('./pages/user/Disbursements'))
const UserNotifications = lazy(() => import('./pages/user/Notifications'))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const Transactions = lazy(() => import('./pages/admin/Transactions'))
const Calculator = lazy(() => import('./pages/admin/Calculator'))
const Queue = lazy(() => import('./pages/admin/Queue'))
const Users = lazy(() => import('./pages/admin/Users'))
const Logs = lazy(() => import('./pages/admin/Logs'))
const PaymentLogs = lazy(() => import('./pages/admin/PaymentLogs'))
const Arbitrage = lazy(() => import('./pages/admin/Arbitrage'))
const LoanTracker = lazy(() => import('./pages/admin/LoanTracker'))
const PaymentDue = lazy(() => import('./pages/admin/PaymentDue'))
const Wallet = lazy(() => import('./pages/admin/Wallet'))
const AdminMessages = lazy(() => import('./pages/admin/Messages'))
const Announcements = lazy(() => import('./pages/admin/Announcements'))
const LoanRequests = lazy(() => import('./pages/admin/LoanRequests'))
const Invoices = lazy(() => import('./pages/admin/Invoices'))
const Disbursements = lazy(() => import('./pages/admin/Disbursements'))
const AdminNotifications = lazy(() => import('./pages/admin/Notifications'))

// Warm the two landing pages (whichever role lands here) once the browser is
// idle, so their chunks download in parallel with session restore instead of
// only after the router lands on the route. This keeps the dashboard — and its
// Notifications button — from popping in a beat late on a cold cache.
if (typeof window !== 'undefined') {
  const warmLandingChunks = () => {
    import('./pages/user/UserDashboard')
    import('./pages/admin/AdminDashboard')
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmLandingChunks, { timeout: 2000 })
  } else {
    setTimeout(warmLandingChunks, 300)
  }
}

// Lightweight route-transition fallback. Deliberately minimal (not the full
// LoanLedger splash) so switching between lazy pages doesn't flash a 5s
// branded animation on every navigation.
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

// Two-tier RBAC route guard. Admin routes are unreachable for general users
// and vice versa; unauthenticated visitors land on the invite-only login.
function Protected({ role, children }) {
  const { session, authLoading } = useApp()
  if (authLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500" role="status">
          Restoring your session…
        </p>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (session.needsPasswordSetup) return <Navigate to="/set-password" replace />
  if (session.user.role !== role)
    return <Navigate to={session.user.role === 'admin' ? '/admin' : '/portal'} replace />
  return <AppShell>{children}</AppShell>
}

export default function App() {
  return (
    <AppProvider>
      <MessagesProvider>
      <AnnouncementsProvider>
      <LoanRequestsProvider>
      <InvoicesProvider>
      <DisbursementsProvider>
      <NotificationsProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          {/* Public — linked from the mobile app's store listings. */}
          <Route path="/privacy" element={<PrivacyPolicy />} />

          <Route path="/portal" element={<Protected role="user"><UserDashboard /></Protected>} />
          <Route path="/portal/loans/:loanId" element={<Protected role="user"><LoanDetail /></Protected>} />
          <Route path="/portal/consolidated" element={<Protected role="user"><ConsolidatedLoans /></Protected>} />
          <Route path="/portal/straight" element={<Protected role="user"><StraightTransactions /></Protected>} />
          <Route path="/portal/payments" element={<Protected role="user"><Payments /></Protected>} />
          <Route path="/portal/payment-logs" element={<Protected role="user"><UserPaymentLogs /></Protected>} />
          <Route path="/portal/messages" element={<Protected role="user"><UserMessages /></Protected>} />
          <Route path="/portal/loan-request" element={<Protected role="user"><LoanRequest /></Protected>} />
          <Route path="/portal/invoices" element={<Protected role="user"><UserInvoices /></Protected>} />
          <Route path="/portal/disbursements" element={<Protected role="user"><UserDisbursements /></Protected>} />
          <Route path="/portal/notifications" element={<Protected role="user"><UserNotifications /></Protected>} />
          <Route path="/portal/announcement/:id" element={<Protected role="user"><AnnouncementDetail /></Protected>} />

          <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
          <Route path="/admin/transactions" element={<Protected role="admin"><Transactions /></Protected>} />
          <Route path="/admin/payment-due" element={<Protected role="admin"><PaymentDue /></Protected>} />
          <Route path="/admin/calculator" element={<Protected role="admin"><Calculator /></Protected>} />
          <Route path="/admin/queue" element={<Protected role="admin"><Queue /></Protected>} />
          <Route path="/admin/users" element={<Protected role="admin"><Users /></Protected>} />
          <Route path="/admin/payment-logs" element={<Protected role="admin"><PaymentLogs /></Protected>} />
          <Route path="/admin/arbitrage" element={<Protected role="admin"><Arbitrage /></Protected>} />
          <Route path="/admin/loan-tracker" element={<Protected role="admin"><LoanTracker /></Protected>} />
          <Route path="/admin/wallet" element={<Protected role="admin"><Wallet /></Protected>} />
          <Route path="/admin/messages" element={<Protected role="admin"><AdminMessages /></Protected>} />
          <Route path="/admin/announcements" element={<Protected role="admin"><Announcements /></Protected>} />
          <Route path="/admin/loan-requests" element={<Protected role="admin"><LoanRequests /></Protected>} />
          <Route path="/admin/invoices" element={<Protected role="admin"><Invoices /></Protected>} />
          <Route path="/admin/disbursements" element={<Protected role="admin"><Disbursements /></Protected>} />
          <Route path="/admin/notifications" element={<Protected role="admin"><AdminNotifications /></Protected>} />
          <Route path="/admin/logs" element={<Protected role="admin"><Logs /></Protected>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </NotificationsProvider>
      </DisbursementsProvider>
      </InvoicesProvider>
      </LoanRequestsProvider>
      </AnnouncementsProvider>
      </MessagesProvider>
    </AppProvider>
  )
}
