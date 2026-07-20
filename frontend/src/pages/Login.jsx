import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import BrandLogo from '../components/BrandLogo.jsx';
import OtpInput, { otpToString } from '../components/OtpInput.jsx';
import './Login.css';

const PLATFORM_STATS = [
  { value: '2.4M+', label: 'Active traders' },
  { value: '$8.2B', label: 'Daily volume' },
  { value: '0.02%', label: 'Maker fee' },
];

const STATIC_TICKERS = [
  // { symbol: 'NIFTY', price: '24,850.30', change: 0.42 },
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
  const { login, loginWithOtp, sendOtp, resendOtp, user, loading: authLoading } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/dashboard';
  const [mode, setMode] = useState('password');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
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

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const id = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  function switchMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setErr('');
    setPassword('');
    setOtp(['', '', '', '', '', '']);
    setOtpSent(false);
    setResendCooldown(0);
  }

  function redirectAfterLogin(data) {
    if (data.user?.role === 'admin') nav('/admin/panel', { replace: true });
    else nav(redirectTo, { replace: true });
    toast.success('Welcome back! You are now signed in.');
  }

  async function handleSendOtp() {
    if (mobile.length !== 10) {
      const message = 'Enter a valid 10-digit mobile number';
      setErr(message);
      toast.warning(message);
      return;
    }

    setErr('');
    setBusy(true);
    try {
      await sendOtp(mobile, 'login');
      setOtpSent(true);
      setResendCooldown(30);
      setOtp(['', '', '', '', '', '']);
      toast.success('OTP sent to your mobile number.');
    } catch (ex) {
      const message = ex.message || 'Could not send OTP';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setErr('');
    setBusy(true);
    try {
      await resendOtp(mobile, 'login');
      setResendCooldown(30);
      setOtp(['', '', '', '', '', '']);
      toast.success('A new OTP has been sent.');
    } catch (ex) {
      const message = ex.message || 'Could not resend OTP';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function onPasswordSubmit(e) {
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
      redirectAfterLogin(data);
    } catch (ex) {
      const message = ex.message || 'Invalid mobile number or password';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function onOtpSubmit(e) {
    e.preventDefault();
    setErr('');

    if (!otpSent) {
      await handleSendOtp();
      return;
    }

    const code = otpToString(otp);
    if (code.length !== 6) {
      const message = 'Enter the 6-digit OTP';
      setErr(message);
      toast.warning(message);
      return;
    }

    setBusy(true);
    try {
      const data = await loginWithOtp(mobile, code);
      redirectAfterLogin(data);
    } catch (ex) {
      const message = ex.message || 'Invalid OTP';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const tickerStrip = [...tickers, ...tickers];

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
              <p className="login-card__subtitle">
                {mode === 'password'
                  ? 'Sign in with your mobile number and password'
                  : 'Sign in with a one-time code sent to your mobile'}
              </p>

              <div className="login-mode-tabs" role="tablist" aria-label="Sign in method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'password'}
                  className={`login-mode-tabs__btn${mode === 'password' ? ' is-active' : ''}`}
                  onClick={() => switchMode('password')}
                >
                  Password
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'otp'}
                  className={`login-mode-tabs__btn${mode === 'otp' ? ' is-active' : ''}`}
                  onClick={() => switchMode('otp')}
                >
                  OTP
                </button>
              </div>

              {mode === 'password' ? (
                <form onSubmit={onPasswordSubmit}>
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
              ) : (
                <form onSubmit={onOtpSubmit}>
                  <div className="login-field">
                    <label htmlFor="otp-mobile">Mobile number</label>
                    <div className="login-mobile-row">
                      <span className="login-mobile-prefix">+91</span>
                      <input
                        id="otp-mobile"
                        type="tel"
                        autoComplete="tel"
                        placeholder="9876543210"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        disabled={otpSent}
                        required
                      />
                    </div>
                  </div>

                  {otpSent && (
                    <>
                      <div className="login-field">
                        <label>Enter OTP</label>
                        <OtpInput value={otp} onChange={setOtp} disabled={busy} idPrefix="login-otp" />
                      </div>
                      <button
                        type="button"
                        className="login-resend"
                        disabled={busy || resendCooldown > 0}
                        onClick={handleResendOtp}
                      >
                        {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                      </button>
                      <button
                        type="button"
                        className="login-change-mobile"
                        disabled={busy}
                        onClick={() => {
                          setOtpSent(false);
                          setOtp(['', '', '', '', '', '']);
                          setResendCooldown(0);
                          setErr('');
                        }}
                      >
                        Change mobile number
                      </button>
                    </>
                  )}

                  {err && <p className="login-error">{err}</p>}

                  <button type="submit" className="login-submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {otpSent ? 'Verifying…' : 'Sending OTP…'}
                      </>
                    ) : otpSent ? (
                      'Verify & sign in'
                    ) : (
                      'Send OTP'
                    )}
                  </button>
                </form>
              )}

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
