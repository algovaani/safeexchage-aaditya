import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import AppHome from './pages/AppHome.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Markets from './pages/Markets.jsx';
import Account from './pages/Account.jsx';
import AccountProfile from './pages/AccountProfile.jsx';
import Transactions from './pages/Transactions.jsx';
import Trading from './pages/Trading.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<Layout />}>
        <Route path="/" element={<AppHome />} />
        <Route path="/exchange" element={<Navigate to="/markets" replace />} />

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
          path="/transactions"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trade"
          element={
            <ProtectedRoute>
              <Trading />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
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
      </Route>
    </Routes>
  );
}
