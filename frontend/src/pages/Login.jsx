import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
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
      if (data.user?.role === 'admin') nav('/admin/panel');
      else nav('/account');
    } catch {
      setErr('Invalid email or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ex-page" style={{ maxWidth: 440, margin: '0 auto' }}>
      <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1 className="h1">Login</h1>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {err && <p style={{ color: 'var(--sell)' }}>{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: '1rem' }}>
        No account? <Link to="/signup">Sign up</Link>
      </p>
      <p className="ex-muted" style={{ marginTop: '1rem', fontSize: '0.82rem', lineHeight: 1.45 }}>
        Admin ke liye dedicated page available hai: <Link to="/admin/login">Admin Login</Link>.
      </p>
      </div>
    </div>
  );
}
