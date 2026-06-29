import { useEffect, useState, useCallback } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import BrandLogo from './BrandLogo.jsx';
import './ExchangeLayout.css';

const TOP_NAV = [
  { to: '/trade', label: 'Exchange', end: true },
  { to: '/wallet', label: 'Account' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/dashboard', label: 'Dashboard' },
];

function portfolioFromWallet(wallet) {
  if (!wallet) return null;
  return Number(wallet.balance_usdt ?? wallet.balance ?? 0);
}

export default function ExchangeLayout() {
  const { user, logout, loading } = useAuth();
  const { pathname } = useLocation();
  const [portfolio, setPortfolio] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isGuest = !loading && !user;
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Guest';
  const initial = displayName[0]?.toUpperCase() || 'G';
  const loginState = { from: { pathname } };

  const loadPortfolio = useCallback(() => {
    if (!user) {
      setPortfolio(null);
      return;
    }
    api
      .get('/wallet/balance')
      .then((r) => setPortfolio(portfolioFromWallet(parseApiResponse(r.data))))
      .catch(() => setPortfolio(null));
  }, [user]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio, pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const onWalletUpdated = (e) => {
      const next = portfolioFromWallet(e.detail);
      if (next != null) setPortfolio(next);
    };
    window.addEventListener('wallet:updated', onWalletUpdated);
    return () => window.removeEventListener('wallet:updated', onWalletUpdated);
  }, []);

  return (
    <div className={`exchange-shell${menuOpen ? ' exchange-shell--menu-open' : ''}`}>
      <button
        type="button"
        className="exchange-drawer-backdrop"
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`exchange-drawer${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen}>
        <div className="exchange-drawer__head">
          <BrandLogo size="sm" />
          <button
            type="button"
            className="exchange-drawer__close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ✕
          </button>
        </div>

        <p className="exchange-drawer__user">{user?.email || displayName}</p>

        {user ? (
          <div className="exchange-drawer__portfolio">
            <span className="exchange-drawer__portfolio-label">Portfolio Value</span>
            <span className="exchange-drawer__portfolio-value">
              {portfolio != null ? `${Number(portfolio).toFixed(2)} USDT` : '—'}
            </span>
          </div>
        ) : (
          <p className="exchange-drawer__guest-note">Browse markets and charts without signing in.</p>
        )}

        <nav className="exchange-drawer__nav" aria-label="Exchange navigation">
          {TOP_NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `exchange-drawer__link${isActive ? ' is-active' : ''}`
              }
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="exchange-drawer__actions">
          {user ? (
            <button
              type="button"
              className="exchange-drawer__logout"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
            >
              Logout
            </button>
          ) : (
            <>
              <Link to="/login" state={loginState} className="exchange-drawer__login" onClick={() => setMenuOpen(false)}>
                Log in
              </Link>
              <Link to="/signup" className="exchange-drawer__signup" onClick={() => setMenuOpen(false)}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </aside>

      <header className="exchange-header">
        <div className="exchange-header__left">
          <button
            type="button"
            className="exchange-header__menu"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <NavLink to="/trade" className="exchange-header__brand">
            <BrandLogo size="sm" />
          </NavLink>
          <nav className="exchange-header__nav" aria-label="Exchange navigation">
            {TOP_NAV.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `exchange-header__link${isActive ? ' is-active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="exchange-header__right">
          {user ? (
            <>
              <div className="exchange-header__portfolio">
                <span className="exchange-header__portfolio-label">Portfolio Value</span>
                <span className="exchange-header__portfolio-value">
                  {portfolio != null ? `${Number(portfolio).toFixed(2)} USDT` : '—'}
                </span>
              </div>
              <div className="exchange-header__avatar" title={user?.email || displayName}>
                {initial}
              </div>
              <button type="button" className="exchange-header__logout" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <div className="exchange-header__auth">
              <Link to="/login" state={loginState} className="exchange-header__login">
                Log in
              </Link>
              <Link to="/signup" className="exchange-header__signup">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="exchange-main">
        <Outlet />
      </main>
    </div>
  );
}
