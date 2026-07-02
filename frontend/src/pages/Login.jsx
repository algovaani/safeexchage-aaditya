import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import BrandLogo from '../components/BrandLogo.jsx';
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
  const { login, user, loading: authLoading } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/dashboard';
  const [mobile, setMobile] = useState('');
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
    if (authLoading || !user) return;
    if (user.role === 'admin') nav('/admin/panel', { replace: true });
    else nav(redirectTo, { replace: true });
  }, [authLoading, user, nav, redirectTo]);

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

    if (mobile.length !== 10) {
      const message = 'Enter a valid 10-digit mobile number';
      setErr(message);
      toast.warning(message);
      return;
    }
    if (!password) {
      const message = 'Enter your password';
      setErr(message);
      toast.warning(message);
      return;
    }

    setBusy(true);
    try {
      const data = await login(mobile, password);
      if (data.user?.role === 'admin') nav('/admin/panel', { replace: true });
      else nav(redirectTo, { replace: true });
      toast.success('Welcome back! You are now signed in.');
    } catch (ex) {
      const message = ex.message || 'Invalid mobile number or password';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <header className="login-nav">
        <div className="login-nav__inner">
          <Link to="/" className="login-nav__brand">
            <BrandLogo size="sm" />
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
              <p className="login-card__subtitle">Sign in with your mobile number and password</p>

              <form onSubmit={onSubmit}>
                <div className="login-field">
                  <label htmlFor="mobile">Mobile number</label>
                  <div className="login-mobile-row">
                    <span className="login-mobile-prefix">+91</span>
                    <input
                      id="mobile"
                      type="tel"
                      autoComplete="tel"
                      placeholder="9876543210"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      required
                    />
                  </div>
                </div>

                <div className="login-field">
                  <label htmlFor="password">Password</label>
                  <div className="login-mobile-row">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="login-eye-toggle"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <Link to="/forgot-password" className="login-forgot">
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

              <p className="login-card__footer">
                No account? <Link to="/signup">Sign up</Link>
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