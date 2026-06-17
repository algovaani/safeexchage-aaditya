import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import './Signup.css';

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['', 'Weak', 'Medium', 'Strong', 'Very Strong'];
  return { score, label: labels[score] };
}

export default function Signup() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [referral, setReferral] = useState('');
  const [showRef, setShowRef] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) {
      setErr('Passwords do not match');
      return;
    }
    if (!agreed) {
      setErr('Please agree to Terms & Privacy Policy');
      return;
    }
    setBusy(true);
    try {
      await register({
        name,
        email,
        password,
        ...(mobile.trim() ? { mobile: `+91${mobile.trim()}` } : {}),
      });
      nav('/dashboard');
    } catch (ex) {
      setErr(ex.message || 'Could not register');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signup-page">
      <header className="signup-nav">
        <Link to="/" className="signup-nav__brand">
          <span className="signup-nav__dot" />
          <span>Safeexchange</span>
        </Link>
        <Link to="/login" className="signup-nav__link">Sign in</Link>
      </header>

      <main className="signup-main">
        <div className="signup-card">
          <h1 className="signup-card__title">Create your account</h1>
          <p className="signup-card__subtitle">Join millions of traders on Safeexchange</p>

          <form onSubmit={onSubmit} className="signup-form">
            <div className="signup-field">
              <label htmlFor="name">Full Name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="signup-field">
              <label htmlFor="email">Email Address</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="signup-field">
              <label htmlFor="mobile">Mobile Number</label>
              <div className="signup-mobile">
                <select aria-label="Country code" defaultValue="+91">
                  <option value="+91">+91</option>
                </select>
                <input
                  id="mobile"
                  type="tel"
                  placeholder="9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              </div>
            </div>

            <div className="signup-field signup-field--password">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <button type="button" className="signup-field__toggle" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {password && (
                <div className="signup-strength">
                  <div className="signup-strength__bar">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`signup-strength__seg${
                          i <= strength.score
                            ? strength.score <= 1
                              ? ' is-weak'
                              : strength.score === 2
                                ? ' is-medium'
                                : strength.score === 3
                                  ? ' is-strong'
                                  : ' is-very'
                            : ''
                        }`}
                      />
                    ))}
                  </div>
                  <span className="signup-strength__label">{strength.label}</span>
                </div>
              )}
            </div>

            <div className="signup-field">
              <label htmlFor="confirm">Confirm Password</label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            <button type="button" className="signup-ref-toggle" onClick={() => setShowRef((v) => !v)}>
              Referral Code (optional)
              {showRef ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showRef && (
              <div className="signup-field">
                <input
                  placeholder="Enter referral code"
                  value={referral}
                  onChange={(e) => setReferral(e.target.value)}
                />
              </div>
            )}

            <label className="signup-check">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                I agree to <a href="#terms">Terms</a> &amp; <a href="#privacy">Privacy Policy</a>
              </span>
            </label>

            {err && <p className="signup-error">{err}</p>}

            <button type="submit" className="signup-submit" disabled={busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : 'Create Account'}
            </button>
          </form>

          <p className="signup-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
