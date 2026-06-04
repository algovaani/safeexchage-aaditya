import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <h2 className="admin-sidebar__title">Admin Panel</h2>
        <p className="admin-sidebar__meta">{user?.email}</p>

        <nav className="admin-sidebar__nav">
          <NavLink to="/admin/panel" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Dashboard
          </NavLink>
        </nav>

        <div className="admin-sidebar__actions">
          <NavLink to="/" className="btn btn-secondary" style={{ width: '100%' }}>
            Back To Exchange
          </NavLink>
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
