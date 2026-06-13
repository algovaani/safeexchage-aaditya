import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <p className="text-text-secondary text-sm py-8 text-center">Loading…</p>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) return <Navigate to="/account" replace />;

  return children;
}
