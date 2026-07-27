import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  AdminNotificationsProvider,
  useAdminNotifications,
} from '../context/AdminNotificationsContext.jsx';
import { useAdminTheme } from '../hooks/useAdminTheme.js';
import { useTheme } from '../context/ThemeContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import BrandLogo from './BrandLogo.jsx';
import AdminNotificationBell from './AdminNotificationBell.jsx';
import '../pages/Admin.css';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: '◉' },
  { id: 'users', label: 'Users', icon: '👤' },
  { id: 'kyc', label: 'KYC', icon: '✓' },
  { id: 'wallets', label: 'Wallets', icon: '💼' },
  { id: 'deposits', label: 'Deposits', icon: '💳', badgeKey: 'pendingDeposits' },
  { id: 'cashInPerson', label: 'Cash in Person', icon: '🤝' },
  { id: 'withdrawals', label: 'Withdrawals', icon: '🏧', badgeKey: 'pendingWithdrawals' },
  { id: 'orders', label: 'Orders', icon: '📋' },
  { id: 'staking', label: 'Investments', icon: '📊' },
  { id: 'prices', label: 'Prices', icon: '📈' },
  { id: 'coins', label: 'Exchange Coins', icon: '🪙' },
  { id: 'futures', label: 'Futures', icon: '⚡' },
  { id: 'logs', label: 'Logs', icon: '📜' },
];

const SECTION_LABELS = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

function AdminShell() {
  useAdminTheme();
  const { isDark } = useTheme();
  const { user, logout } = useAuth();
  const shellTheme = isDark ? 'dark' : 'light';
  const location = useLocation();
  const section = new URLSearchParams(location.search).get('section') || 'overview';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notify = useAdminNotifications();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const pendingDeposits = notify?.pendingDeposits || 0;
  const pendingWithdrawals = notify?.pendingWithdrawals || 0;
  const badgeFor = (key) => {
    if (key === 'pendingDeposits') return pendingDeposits;
    if (key === 'pendingWithdrawals') return pendingWithdrawals;
    return 0;
  };
  const totalPending = pendingDeposits + pendingWithdrawals;

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
            <BrandLogo size="sm" />
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
          {SECTIONS.map((s) => {
            const count = badgeFor(s.badgeKey);
            return (
              <Link
                key={s.id}
                to={`/admin/panel?section=${s.id}`}
                className={`admin-nav__link${section === s.id ? ' is-active' : ''}${count > 0 ? ' has-badge' : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <span className="admin-nav__icon" aria-hidden>
                  {s.icon}
                </span>
                <span className="admin-nav__label">{s.label}</span>
                {count > 0 && (
                  <span className="admin-nav__badge" aria-label={`${count} pending`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            );
          })}
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
        <header className="admin-topbar">
          <div className="admin-mobile-bar">
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
              <BrandLogo size="sm" className="admin-mobile-bar__logo" />
              <span className="admin-mobile-bar__section">{SECTION_LABELS[section] || 'Admin'}</span>
            </div>
          </div>

          <div className="admin-topbar__right">
            {totalPending > 0 && (
              <div className="admin-alert-strip" role="status">
                <span className="admin-alert-strip__pulse" aria-hidden />
                <span>
                  {pendingDeposits > 0 && (
                    <Link to="/admin/panel?section=deposits" className="admin-alert-strip__link">
                      {pendingDeposits} deposit{pendingDeposits === 1 ? '' : 's'}
                    </Link>
                  )}
                  {pendingDeposits > 0 && pendingWithdrawals > 0 && ' · '}
                  {pendingWithdrawals > 0 && (
                    <Link to="/admin/panel?section=withdrawals" className="admin-alert-strip__link">
                      {pendingWithdrawals} withdrawal{pendingWithdrawals === 1 ? '' : 's'}
                    </Link>
                  )}
                  {' awaiting review'}
                </span>
              </div>
            )}
            <AdminNotificationBell />
          </div>
        </header>

        <main className={`admin-content admin-content--${shellTheme}`}>
          <Outlet context={{ adminPending: { pendingDeposits, pendingWithdrawals } }} />
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminNotificationsProvider>
      <AdminShell />
    </AdminNotificationsProvider>
  );
}
