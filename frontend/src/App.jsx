import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ExchangeLayout from './components/ExchangeLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import PageLoader from './components/PageLoader.jsx';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Signup = lazy(() => import('./pages/Signup.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const InviteRedirect = lazy(() => import('./pages/InviteRedirect.jsx'));
const AdminLogin = lazy(() => import('./pages/AdminLogin.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Markets = lazy(() => import('./pages/Markets.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Deposit = lazy(() => import('./pages/Deposit.jsx'));
const AccountProfile = lazy(() => import('./pages/AccountProfile.jsx'));
const ReferEarn = lazy(() => import('./pages/ReferEarn.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Trading = lazy(() => import('./pages/Trading.jsx'));
const Futures = lazy(() => import('./pages/Futures.jsx'));
const Staking = lazy(() => import('./pages/Staking.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail.jsx'));

function Lazy({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Lazy>
            <Landing />
          </Lazy>
        }
      />
      <Route
        path="/admin/login"
        element={
          <Lazy>
            <AdminLogin />
          </Lazy>
        }
      />
      <Route
        path="/login"
        element={
          <Lazy>
            <Login />
          </Lazy>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <Lazy>
            <ForgotPassword />
          </Lazy>
        }
      />
      <Route
        path="/signup"
        element={
          <Lazy>
            <Signup />
          </Lazy>
        }
      />
      <Route
        path="/invite/:code"
        element={
          <Lazy>
            <InviteRedirect />
          </Lazy>
        }
      />

      <Route element={<ExchangeLayout />}>
        <Route
          path="/trade"
          element={
            <Lazy>
              <Trading />
            </Lazy>
          }
        />
        <Route
          path="/futures"
          element={
            <Lazy>
              <Futures />
            </Lazy>
          }
        />
        <Route path="/exchange" element={<Navigate to="/trade" replace />} />
      </Route>

      <Route element={<Layout />}>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Lazy>
                <Dashboard />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route
          path="/markets"
          element={
            <ProtectedRoute>
              <Lazy>
                <Markets />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallet/deposit"
          element={
            <ProtectedRoute>
              <Lazy>
                <Deposit />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallet"
          element={
            <ProtectedRoute>
              <Lazy>
                <Account />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route path="/account" element={<Navigate to="/wallet" replace />} />

        <Route
          path="/account/profile/*"
          element={
            <ProtectedRoute>
              <Lazy>
                <AccountProfile />
              </Lazy>
            </ProtectedRoute>
          }
        />

        <Route
          path="/refer"
          element={
            <ProtectedRoute>
              <Lazy>
                <ReferEarn />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <Lazy>
                <Transactions />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route
          path="/staking"
          element={
            <ProtectedRoute>
              <Lazy>
                <Staking />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route
          path="/support"
          element={
            <ProtectedRoute>
              <Lazy>
                <Support />
              </Lazy>
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
        <Route
          path="panel"
          element={
            <Lazy>
              <Admin />
            </Lazy>
          }
        />
        <Route
          path="users/:userId"
          element={
            <Lazy>
              <AdminUserDetail />
            </Lazy>
          }
        />
      </Route>
    </Routes>
  );
}
