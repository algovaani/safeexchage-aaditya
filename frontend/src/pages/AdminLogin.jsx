import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminTheme } from '../hooks/useAdminTheme.js';
import './Admin.css';

export default function AdminLogin() {
  useAdminTheme();
  const { login, logout } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const data = await login(email, password);
      if (data.user?.role !== 'admin') {
        logout();
        setErr('This account is not an admin account.');
        return;
      }
      nav('/admin/panel?section=overview');
    } catch {
      setErr('Invalid admin credentials');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <h1>Admin Login</h1>
        <p className="admin-muted">Only admin users can access this panel.</p>
        <p className="admin-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Dev default (after <code>npm run seed</code>):{' '}
          <strong>admin@safex.local</strong> / <strong>ChangeMeAdmin123!</strong>
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: '1.25rem' }}>
          <div className="admin-field" style={{ marginBottom: '0.85rem' }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="admin-field" style={{ marginBottom: '0.85rem' }}>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {err && <p className="admin-login-error">{err}</p>}

          <button className="admin-btn admin-btn--primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in as Admin'}
          </button>
        </form>

        <p className="admin-muted" style={{ marginTop: '1rem' }}>
          User login? <Link to="/login">Go to user login</Link>
        </p>
      </div>
    </div>
  );
}
