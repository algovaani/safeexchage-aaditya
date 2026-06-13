import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import './Login.css';

const PLATFORM_STATS = [
  { value: '2.4M+', label: 'Active traders' },
  { value: '$8.2B', label: 'Daily volume' },
  { value: '0.02%', label: 'Maker fee' },
];

const STATIC_TICKERS = [
  { symbol: 'NIFTY', price: '24,850.30', change: 0.42 },
  { symbol: 'SENSEX', price: '81,432.15', change: -0.18 },
  { symbol: 'USDINR', price: '83.24', change: 0.05 },
];

function fmtPrice(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : v.toFixed(digits);
}

function fmtChange(pct) {
  const v = Number(pct);
  if (!Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function TickerItem({ symbol, price, change }) {
  const up = Number(change) >= 0;
  return (
    <div className="login-ticker__item">
      <span className="login-ticker__symbol">{symbol}</span>
      <span className="login-ticker__price">{price}</span>
      <span className={`login-ticker__change login-ticker__change--${up ? 'up' : 'down'}`}>
        {fmtChange(change)}
      </span>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tickers, setTickers] = useState([
    { symbol: 'BTC', price: '—', change: 0 },
    { symbol: 'ETH', price: '—', change: 0 },
    ...STATIC_TICKERS,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadCryptoTickers() {
      try {
        const [btcRes, ethRes] = await Promise.all([
          api.get('/market/ticker', { params: { symbol: 'BTCUSDT' } }),
          api.get('/market/ticker', { params: { symbol: 'ETHUSDT' } }),
        ]);
        const btc = parseApiResponse(btcRes.data);
        const eth = parseApiResponse(ethRes.data);
        if (cancelled) return;

        setTickers([
          {
            symbol: 'BTC',
            price: fmtPrice(btc?.lastPrice ?? btc?.price, 0),
            change: Number(btc?.priceChangePercent ?? 0),
          },
          {
            symbol: 'ETH',
            price: fmtPrice(eth?.lastPrice ?? eth?.price, 0),
            change: Number(eth?.priceChangePercent ?? 0),
          },
          ...STATIC_TICKERS,
        ]);
      } catch {
        /* keep static fallbacks */
      }
    }

    loadCryptoTickers();
    const id = setInterval(loadCryptoTickers, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const tickerStrip = [...tickers, ...tickers];

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const data = await login(identifier, password);
      if (data.user?.role === 'admin') nav('/admin/panel');
      else nav('/dashboard');
    } catch (ex) {
      setErr(ex?.response?.data?.message || 'Invalid email/mobile or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <header className="login-nav">
        <div className="login-nav__inner">
          <Link to="/" className="login-nav__brand">
            <span className="login-nav__dot" aria-hidden />
            <span className="login-nav__logo">SAFEX</span>
          </Link>
          <Link to="/signup" className="login-nav__signup">
            Sign up
          </Link>
        </div>
      </header>

      <main className="login-main">
        <div className="login-grid">
          <section className="login-hero" aria-labelledby="login-hero-title">
            <h1 id="login-hero-title" className="login-hero__tagline">
              Trade smarter. <span>Earn faster.</span>
            </h1>
            <p className="login-hero__sub">
              Real-time markets, deep liquidity, and zero hidden fees — built for serious traders.
            </p>
            <div className="login-stats">
              {PLATFORM_STATS.map((s) => (
                <div key={s.label} className="login-stat">
                  <span className="login-stat__value">{s.value}</span>
                  <span className="login-stat__label">{s.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="login-card-wrap" aria-label="Sign in">
            <div className="login-card">
              <h2 className="login-card__title">Welcome back</h2>
              <p className="login-card__subtitle">Sign in to your SAFEX account</p>

              <form onSubmit={onSubmit}>
                <div className="login-field">
                  <label htmlFor="identifier">Email or mobile</label>
                  <input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    placeholder="you@email.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>

                <div className="login-field login-field--password">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <Link to="/login" className="login-forgot" onClick={(e) => e.preventDefault()}>
                  Forgot password?
                </Link>

                {err && <p className="login-error">{err}</p>}

                <button type="submit" className="login-submit" disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>

              <div className="login-divider">
                <span>or continue with</span>
              </div>

              <div className="login-social">
                <button type="button" className="login-social__btn" disabled title="Coming soon">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </button>
                <button type="button" className="login-social__btn" disabled title="Coming soon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                  Apple
                </button>
              </div>

              <p className="login-card__footer">
                No account?{' '}
                <Link to="/signup">Sign up</Link>
                <span className="login-card__footer-sep">·</span>
                <Link to="/admin/login">Admin Login</Link>
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="login-ticker" aria-label="Live market prices">
        <div className="login-ticker__track">
          {tickerStrip.map((t, i) => (
            <TickerItem key={`${t.symbol}-${i}`} {...t} />
          ))}
        </div>
      </footer>
    </div>
  );
}
