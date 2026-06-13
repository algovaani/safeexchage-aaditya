import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function AppHome() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-64" />
      </div>
    );
  }

  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}
