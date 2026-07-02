import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ExchangeLayout from './components/ExchangeLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import InviteRedirect from './pages/InviteRedirect.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Markets from './pages/Markets.jsx';
import Account from './pages/Account.jsx';
import Deposit from './pages/Deposit.jsx';
import AccountProfile from './pages/AccountProfile.jsx';
import ReferEarn from './pages/ReferEarn.jsx';
import Transactions from './pages/Transactions.jsx';
import Trading from './pages/Trading.jsx';
import Staking from './pages/Staking.jsx';
import Admin from './pages/Admin.jsx';
import AdminUserDetail from './pages/admin/AdminUserDetail.jsx';


export default function App() {
  return (
    <Routes>
      {/* Public site — same domain: landing + auth (no app sidebar) */}
      <Route path="/" element={<Landing />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/invite/:code" element={<InviteRedirect />} />

      <Route element={<ExchangeLayout />}>
        <Route path="/trade" element={<Trading />} />
        <Route path="/exchange" element={<Navigate to="/trade" replace />} />
      </Route>

      <Route element={<Layout />}>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/markets"
          element={
            <ProtectedRoute>
              <Markets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallet/deposit"
          element={
            <ProtectedRoute>
              <Deposit />
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallet"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />
        <Route path="/account" element={<Navigate to="/wallet" replace />} />

        <Route
          path="/account/profile/*"
          element={
            <ProtectedRoute>
              <AccountProfile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/refer"
          element={
            <ProtectedRoute>
              <ReferEarn />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staking"
          element={
            <ProtectedRoute>
              <Staking />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="/admin/panel?section=overview" replace />} />
        <Route path="panel" element={<Admin />} />
        <Route path="users/:userId" element={<AdminUserDetail />} />
      </Route>
    </Routes>
  );
}
