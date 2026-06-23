import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import BrandLogo from './BrandLogo.jsx';
import './ExchangeLayout.css';

const TOP_NAV = [
  { to: '/trade', label: 'Exchange', end: true },
  { to: '/wallet', label: 'Account' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/trade', label: 'Trade', end: true },
];

export default function ExchangeLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [portfolio, setPortfolio] = useState(null);

  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Trader';
  const initial = displayName[0]?.toUpperCase() || 'S';

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

  return (
    <div className="exchange-shell">
      <header className="exchange-header">
        <div className="exchange-header__left">
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
        </div>
      </header>

      <main className="exchange-main">
        <Outlet />
      </main>
    </div>
  );
}
