import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminTheme } from '../hooks/useAdminTheme.js';
import { useTheme } from '../context/ThemeContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import '../pages/Admin.css';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: '◉' },
  { id: 'users', label: 'Users', icon: '👤' },
  { id: 'kyc', label: 'KYC', icon: '✓' },
  { id: 'wallet', label: 'Wallet', icon: '💰' },
  { id: 'orders', label: 'Orders', icon: '📋' },
  { id: 'prices', label: 'Prices', icon: '📈' },
];

const SECTION_LABELS = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

export default function AdminLayout() {
  useAdminTheme();
  const { isDark } = useTheme();
  const { user, logout } = useAuth();
  const shellTheme = isDark ? 'dark' : 'light';
  const location = useLocation();
  const section = new URLSearchParams(location.search).get('section') || 'overview';
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <div className={`admin-shell admin-shell--${shellTheme}${drawerOpen ? ' admin-shell--drawer-open' : ''}`}>
      <button
        type="button"
        className="admin-drawer-backdrop"
        aria-label="Close menu"
        onClick={() => setDrawerOpen(false)}
      />

      <aside className={`admin-sidebar admin-sidebar--${shellTheme}${drawerOpen ? ' is-open' : ''}`}>
        <div className="admin-sidebar__top">
          <div className="admin-brand">
            <span className="admin-brand__mark bg-accent" aria-hidden />
            <div>
              <p className="admin-brand__text">SAFEX</p>
              <p className="admin-brand__sub">Admin Control</p>
            </div>
          </div>
          <button
            type="button"
            className="admin-drawer-close"
            aria-label="Close sidebar"
            onClick={() => setDrawerOpen(false)}
          >
            ✕
          </button>
        </div>

        <p className="admin-sidebar__meta">{user?.email}</p>

        <nav className="admin-nav" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <Link
              key={s.id}
              to={`/admin/panel?section=${s.id}`}
              className={`admin-nav__link${section === s.id ? ' is-active' : ''}`}
              onClick={() => setDrawerOpen(false)}
            >
              <span className="admin-nav__icon" aria-hidden>
                {s.icon}
              </span>
              {s.label}
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar__actions">
          <div className="flex justify-center mb-2">
            <ThemeToggle />
          </div>
          <Link to="/" className="admin-btn admin-btn--ghost" onClick={() => setDrawerOpen(false)}>
            ← Exchange
          </Link>
          <button type="button" className="admin-btn admin-btn--primary" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-mobile-bar">
          <button
            type="button"
            className="admin-menu-btn"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="admin-mobile-bar__title">
            <span className="admin-mobile-bar__brand">SAFEX</span>
            <span className="admin-mobile-bar__section">{SECTION_LABELS[section] || 'Admin'}</span>
          </div>
        </header>

        <main className={`admin-content admin-content--${shellTheme}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
