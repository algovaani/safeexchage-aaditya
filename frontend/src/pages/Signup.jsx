import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Signup() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await register({ name, email, password });
      nav('/account');
    } catch (ex) {
      if (!ex.response) {
        setErr(
          'Cannot reach the API. Start the backend (cd backend && npm run dev) and open http://127.0.0.1:5001/api/health'
        );
      } else {
        setErr(ex.response?.data?.error || ex.response?.data?.hint || 'Could not register');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ex-page" style={{ maxWidth: 440, margin: '0 auto' }}>
    <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1 className="h1">Sign up</h1>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password (min 8)</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {err && <p style={{ color: 'var(--sell)' }}>{typeof err === 'string' ? err : JSON.stringify(err)}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: '1rem' }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
    </div>
  );
}
