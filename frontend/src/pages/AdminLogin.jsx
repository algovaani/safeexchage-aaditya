import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminLogin() {
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
      nav('/admin/panel');
    } catch {
      setErr('Invalid admin credentials');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ex-page" style={{ maxWidth: 460, margin: '3rem auto' }}>
      <div className="card">
        <h1 className="h1">Admin Login</h1>
        <p className="ex-muted">Only admin users can access this panel.</p>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {err && <p style={{ color: 'var(--sell)' }}>{err}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in as Admin'}
          </button>
        </form>

        <p className="ex-muted" style={{ marginTop: '1rem' }}>
          User login? <Link to="/login">Go to user login</Link>
        </p>
      </div>
    </div>
  );
}
