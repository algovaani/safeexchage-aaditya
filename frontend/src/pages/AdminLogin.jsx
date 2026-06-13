import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import './AdminLogin.css';

export default function AdminLogin() {
  const { login, logout } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function handleOtpChange(i, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const data = await login(email, password);
      if (data.user?.role !== 'admin') {
        await logout();
        setErr('This account is not an admin account.');
        return;
      }
      nav('/admin/panel?section=overview');
    } catch (ex) {
      setErr(ex.message || 'Invalid admin credentials');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-page">
      <header className="admin-login-nav">
        <Link to="/" className="admin-login-nav__brand">
          <span className="admin-login-nav__dot" />
          SAFEX
        </Link>
      </header>

      <main className="admin-login-main">
        <div className="admin-login-card">
          <span className="admin-login-badge">
            <ShieldAlert size={14} />
            Admin Access Only
          </span>

          <h1 className="admin-login-card__title">Admin Login</h1>
          <p className="admin-login-card__subtitle">Restricted area — authorized personnel only</p>

          <form onSubmit={onSubmit}>
            <div className="admin-login-field">
              <label htmlFor="admin-email">Admin Email</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="admin-login-field admin-login-field--pw">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="admin-login-field__toggle" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="admin-login-field">
              <label>OTP (optional)</label>
              <div className="admin-login-otp">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    aria-label={`OTP digit ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {err && <p className="admin-login-error">{err}</p>}

            <button type="submit" className="admin-login-submit" disabled={busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Login'}
            </button>
          </form>

          <p className="admin-login-hint text-xs text-text-muted mt-4">
            Dev: <strong className="text-text-secondary">admin@vencrypto.local</strong> /{' '}
            <strong className="text-text-secondary">ChangeMeAdmin123!</strong>
          </p>
        </div>
      </main>
    </div>
  );
}
