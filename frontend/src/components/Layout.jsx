import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  LineChart,
  ArrowLeftRight,
  PieChart,
  ListOrdered,
  Wallet,
  FileText,
  Settings,
  Search,
  Bell,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import ThemeToggle from './ThemeToggle.jsx';
import BrandLogo from './BrandLogo.jsx';
import './AppShell.css';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/markets', icon: LineChart, label: 'Markets' },
  { to: '/trade', icon: ArrowLeftRight, label: 'Trade' },
  { to: '/dashboard', icon: PieChart, label: 'Portfolio', match: '/dashboard' },
  { to: '/trade', icon: ListOrdered, label: 'Orders', match: '/trade' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/transactions', icon: FileText, label: 'Reports' },
  { to: '/account/profile', icon: Settings, label: 'Settings' },
];

function isNavActive(pathname, item) {
  if (item.label === 'Portfolio' || item.label === 'Orders') return false;
  if (item.to === '/account/profile') return pathname.startsWith('/account/profile');
  if (item.to === '/wallet') return pathname === '/wallet' || pathname === '/account';
  return pathname === item.to || (item.to !== '/dashboard' && pathname.startsWith(item.to));
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const fullWidth = pathname === '/trade';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setPortfolio(null);
      return;
    }
    api
      .get('/wallet/balance')
      .then((r) => {
        const wallet = parseApiResponse(r.data);
        setPortfolio(wallet?.balance_usdt ?? wallet?.balance ?? 0);
      })
      .catch(() => setPortfolio(null));
  }, [user, pathname]);

  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Trader';
  const initial = displayName[0]?.toUpperCase() || 'S';

  return (
    <div className={`app-shell${fullWidth ? ' app-shell--wide' : ''}`}>
      <aside className={`app-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="app-sidebar__brand">
          <BrandLogo size="sm" />
          <button type="button" className="app-sidebar__close lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="app-sidebar__nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(pathname, item);
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={`app-sidebar__link${active ? ' is-active' : ''}`}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {user && (
          <div className="app-sidebar__user">
            <div className="app-sidebar__avatar">{initial}</div>
            <div className="app-sidebar__user-info">
              <span className="app-sidebar__user-name">{displayName}</span>
              <span className="app-sidebar__user-email">{user.email}</span>
            </div>
          </div>
        )}
      </aside>

      {sidebarOpen && (
        <button type="button" className="app-sidebar-backdrop" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="app-main">
        <header className="app-navbar">
          <button type="button" className="app-navbar__menu lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>

          <NavLink to="/dashboard" className="app-navbar__logo-mobile lg:hidden">
            <BrandLogo size="sm" />
          </NavLink>

          <div className="app-navbar__search">
            <Search size={16} className="app-navbar__search-icon" />
            <input type="search" placeholder="Search markets, assets…" className="app-navbar__search-input" />
          </div>

          <div className="app-navbar__actions">
            {portfolio != null && (
              <div className="app-navbar__balance hidden sm:flex">
                <span className="text-[11px] uppercase tracking-wider text-text-secondary">Balance</span>
                <span className="text-sm font-medium tabular-nums">{Number(portfolio).toFixed(2)} USDT</span>
              </div>
            )}
            <button type="button" className="app-navbar__icon-btn" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <ThemeToggle className="app-navbar__icon-btn" />
            <div className="app-navbar__avatar">{initial}</div>
            {user && (
              <button type="button" className="btn-secondary hidden md:inline-flex !h-9 !text-xs" onClick={logout}>
                Logout
              </button>
            )}
          </div>
        </header>

        <main className={`app-content${fullWidth ? ' app-content--wide' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
