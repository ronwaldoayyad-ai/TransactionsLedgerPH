import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import AppShell from './components/AppShell'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import UserDashboard from './pages/user/UserDashboard'
import LoanDetail from './pages/user/LoanDetail'
import ConsolidatedLoans from './pages/user/ConsolidatedLoans'
import StraightTransactions from './pages/user/StraightTransactions'
import Payments from './pages/user/Payments'
import UserPaymentLogs from './pages/user/PaymentLogs'
import AdminDashboard from './pages/admin/AdminDashboard'
import Transactions from './pages/admin/Transactions'
import Calculator from './pages/admin/Calculator'
import Queue from './pages/admin/Queue'
import Users from './pages/admin/Users'
import Logs from './pages/admin/Logs'
import PaymentLogs from './pages/admin/PaymentLogs'
import Arbitrage from './pages/admin/Arbitrage'
import LoanTracker from './pages/admin/LoanTracker'
import Wallet from './pages/admin/Wallet'

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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />

          <Route path="/portal" element={<Protected role="user"><UserDashboard /></Protected>} />
          <Route path="/portal/loans/:loanId" element={<Protected role="user"><LoanDetail /></Protected>} />
          <Route path="/portal/consolidated" element={<Protected role="user"><ConsolidatedLoans /></Protected>} />
          <Route path="/portal/straight" element={<Protected role="user"><StraightTransactions /></Protected>} />
          <Route path="/portal/payments" element={<Protected role="user"><Payments /></Protected>} />
          <Route path="/portal/payment-logs" element={<Protected role="user"><UserPaymentLogs /></Protected>} />

          <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
          <Route path="/admin/transactions" element={<Protected role="admin"><Transactions /></Protected>} />
          <Route path="/admin/calculator" element={<Protected role="admin"><Calculator /></Protected>} />
          <Route path="/admin/queue" element={<Protected role="admin"><Queue /></Protected>} />
          <Route path="/admin/users" element={<Protected role="admin"><Users /></Protected>} />
          <Route path="/admin/payment-logs" element={<Protected role="admin"><PaymentLogs /></Protected>} />
          <Route path="/admin/arbitrage" element={<Protected role="admin"><Arbitrage /></Protected>} />
          <Route path="/admin/loan-tracker" element={<Protected role="admin"><LoanTracker /></Protected>} />
          <Route path="/admin/wallet" element={<Protected role="admin"><Wallet /></Protected>} />
          <Route path="/admin/logs" element={<Protected role="admin"><Logs /></Protected>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
