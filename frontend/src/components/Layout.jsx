import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { pathname } = useLocation();
  const wide = pathname === '/trade';
  const isLanding = pathname === '/' && !user;
  const [portfolio, setPortfolio] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('vc-theme') === 'dark');

  useEffect(() => {
    document.body.classList.toggle('ex-dark-mode', darkMode);
    localStorage.setItem('vc-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (!user) {
      setPortfolio(null);
      return;
    }
    api
      .get('/wallet/balance')
      .then((r) => setPortfolio(r.data?.balance ?? 0))
      .catch(() => setPortfolio(null));
  }, [user, pathname]);

  const accountActive = pathname === '/account' || pathname.startsWith('/account/');

  return (
    <div
      className={`shell${wide ? ' shell--wide' : ''}${isLanding ? ' shell--landing' : ''}`}
    >
      {!isLanding && (
      <header className="ex-topnav">
        <div className="ex-topnav__row">
          <NavLink to="/" className="ex-logo">
            <span className="ex-logo__mark" aria-hidden />
            <span className="ex-logo__text">VENCRYPTO</span>
          </NavLink>

          {user && (
            <nav className="ex-topnav__links">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
                Exchange
              </NavLink>
              <NavLink
                to="/account"
                className={({ isActive }) => (isActive || accountActive ? 'is-active' : '')}
              >
                Account
              </NavLink>
              <NavLink to="/transactions" className={({ isActive }) => (isActive ? 'is-active' : '')}>
                Transactions
              </NavLink>
              <NavLink to="/trade" className={({ isActive }) => (isActive ? 'is-active' : '')}>
                Trade
              </NavLink>
              {isAdmin && (
                <NavLink to="/admin/panel" className={({ isActive }) => (isActive ? 'is-active' : '')}>
                  Admin
                </NavLink>
              )}
            </nav>
          )}

          <div className="ex-topnav__right">
            {user && (
              <>
                <button
                  type="button"
                  className="ex-icon-btn"
                  title={darkMode ? 'Light mode' : 'Dark mode'}
                  aria-label="Toggle theme"
                  onClick={() => setDarkMode((d) => !d)}
                >
                  {darkMode ? '☀' : '☾'}
                </button>
                <span className="ex-portfolio">
                  Portfolio : {portfolio != null ? `${Number(portfolio).toFixed(2)} USDT` : '—'}
                </span>
                <button type="button" className="ex-link-btn" onClick={logout}>
                  Logout
                </button>
              </>
            )}
            {!user && (
              <>
                <button
                  type="button"
                  className="ex-icon-btn"
                  title="Theme"
                  onClick={() => setDarkMode((d) => !d)}
                >
                  {darkMode ? '☀' : '☾'}
                </button>
                <NavLink to="/login" className="ex-link-btn">
                  Login
                </NavLink>
                <NavLink to="/signup" className="ex-pill-btn">
                  Sign up
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      )}

      <main className="ex-main">
        <Outlet />
      </main>

      {!wide && !isLanding && (
        <footer className="ex-footer">
          <div className="ex-footer__cols">
            <div>
              <strong>About</strong>
              <a href="#about">About Us</a>
              <a href="#contact">Contact Us</a>
            </div>
            <div>
              <strong>Services</strong>
              <a href="#list">List Your Coin</a>
              <a href="#privacy">Privacy &amp; Policy</a>
            </div>
            <div>
              <strong>Support</strong>
              <a href="#support">Support</a>
              <a href="#faq">FAQ</a>
            </div>
            <div>
              <strong>Product</strong>
              <NavLink to="/trade">Exchange</NavLink>
            </div>
          </div>
          <p className="ex-footer__copy">© {new Date().getFullYear()} Vencrypto Exchange. All Rights Reserved</p>
        </footer>
      )}
    </div>
  );
}
