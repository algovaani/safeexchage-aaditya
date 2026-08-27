import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

import PageLoader from './PageLoader.jsx';

export default function ProtectedRoute({ children, adminOnly }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  // With cached profile, loading is false → shell paints instantly
  if (loading && !user) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/account" replace />;

  return children ?? <Outlet />;
}
