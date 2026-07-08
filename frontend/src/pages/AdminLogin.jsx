import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import './AdminLogin.css';

export default function AdminLogin() {
  const { adminLogin, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldsLocked, setFieldsLocked] = useState(true);

  function unlockFields() {
    if (fieldsLocked) setFieldsLocked(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const data = await adminLogin(email, password);
      if (data.user?.role !== 'admin') {
        await logout();
        const message = 'This account is not an admin account.';
        setErr(message);
        toast.error(message);
        return;
      }
      toast.success('Admin login successful.');
      nav('/admin/panel?section=overview');
    } catch (ex) {
      const message = ex.message || 'Invalid admin credentials';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-page">
      <header className="admin-login-nav">
        <Link to="/" className="admin-login-nav__brand">
          <BrandLogo size="sm" />
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

          <form onSubmit={onSubmit} autoComplete="off">
            <input type="text" name="fakeusernameremembered" className="admin-login-hidden-field" tabIndex={-1} aria-hidden="true" />
            <input type="password" name="fakepasswordremembered" className="admin-login-hidden-field" tabIndex={-1} aria-hidden="true" />

            <div className="admin-login-field">
              <label htmlFor="admin-email">Admin Email</label>
              <input
                id="admin-email"
                name="admin-email-field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={unlockFields}
                readOnly={fieldsLocked}
                autoComplete="off"
                required
              />
            </div>

            <div className="admin-login-field admin-login-field--pw">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                name="admin-password-field"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={unlockFields}
                readOnly={fieldsLocked}
                autoComplete="new-password"
                required
              />
              <button type="button" className="admin-login-field__toggle" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {err && <p className="admin-login-error">{err}</p>}

            <button type="submit" className="admin-login-submit" disabled={busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Login'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
