import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import OtpInput, { otpToString } from '../components/OtpInput.jsx';
import './Signup.css';

export default function Signup() {
  const { register, sendOtp, resendOtp, user, loading: authLoading } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referral, setReferral] = useState('');
  const [referralFromLink, setReferralFromLink] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const fromUrl = searchParams.get('ref') || searchParams.get('referral') || '';
    const normalized = fromUrl.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized) {
      setReferral(normalized);
      setReferralFromLink(true);
      setShowRef(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const id = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (user.role === 'admin') nav('/admin/panel', { replace: true });
    else nav('/dashboard', { replace: true });
  }, [authLoading, user, nav]);

  async function handleSendOtp() {
    if (!agreed) {
      const message = 'Please agree to Terms & Privacy Policy';
      setErr(message);
      toast.warning(message);
      return;
    }
    if (mobile.length !== 10) {
      const message = 'Enter a valid 10-digit mobile number';
      setErr(message);
      toast.warning(message);
      return;
    }
    if (password.length < 8) {
      const message = 'Password must be at least 8 characters';
      setErr(message);
      toast.warning(message);
      return;
    }
    if (password !== confirmPassword) {
      const message = 'Passwords do not match';
      setErr(message);
      toast.warning(message);
      return;
    }

    setErr('');
    setBusy(true);
    try {
      await sendOtp(mobile, 'register');
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
      await resendOtp(mobile, 'register');
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

  async function onSubmit(e) {
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
      await register({
        name,
        mobile,
        password,
        otp: code,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(referral.trim() ? { referralCode: referral.trim().toUpperCase() } : {}),
      });
      toast.success('Account created successfully. Welcome to SafeXchange!');
      nav('/dashboard');
    } catch (ex) {
      const message = ex.message || 'Could not register';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signup-page">
      <header className="signup-nav">
        <Link to="/" className="signup-nav__brand">
          <BrandLogo size="sm" />
        </Link>
        <Link to="/login" className="signup-nav__link">Sign in</Link>
      </header>

      <main className="signup-main">
        <div className="signup-card">
          <h1 className="signup-card__title">Create your account</h1>
          <p className="signup-card__subtitle">Verify your mobile number with OTP</p>

          {referralFromLink && referral.trim() && (
            <div className="signup-invite-banner" role="status">
              <p className="signup-invite-banner__title">You were invited!</p>
              <p className="signup-invite-banner__text">
                Referral code <strong>{referral.trim().toUpperCase()}</strong> is applied to your registration.
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="signup-form">
            <div className="signup-field">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={otpSent}
                required
              />
            </div>

            {/* <div className="signup-field">
              <label htmlFor="email">Email Address (optional)</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={otpSent}
              />
            </div> */}

            <div className="signup-field">
              <label htmlFor="mobile">Mobile Number</label>
              <div className="signup-mobile">
                <select aria-label="Country code" defaultValue="+91" disabled>
                  <option value="+91">+91</option>
                </select>
                <input
                  id="mobile"
                  type="tel"
                  placeholder=""
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  disabled={otpSent}
                  required
                />
              </div>
            </div>

            <div className="signup-field">
              <label htmlFor="password">Password</label>
              <div className="signup-mobile">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={otpSent}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={otpSent}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="signup-field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={otpSent}
                minLength={8}
                required
              />
            </div>

            {otpSent && (
              <div className="signup-field">
                <label>Enter OTP</label>
                <OtpInput value={otp} onChange={setOtp} disabled={busy} idPrefix="signup-otp" />
                <button
                  type="button"
                  className="signup-resend"
                  onClick={handleResendOtp}
                  disabled={busy || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            )}

            <button type="button" className="signup-ref-toggle" onClick={() => setShowRef((v) => !v)}>
              Referral Code {referral.trim() ? `(${referral.trim().toUpperCase()})` : '(optional)'}
              {showRef ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showRef && (
              <div className="signup-field">
                <label htmlFor="referral">Referral code</label>
                <input
                  id="referral"
                  placeholder="Enter referral code"
                  value={referral}
                  onChange={(e) => {
                    setReferralFromLink(false);
                    setReferral(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  }}
                  disabled={otpSent}
                  maxLength={16}
                />
                {referralFromLink && referral.trim() && (
                  <p className="signup-field-hint">Pre-filled from your invite link.</p>
                )}
              </div>
            )}

            <label className="signup-check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={otpSent}
              />
              <span>
                I agree to <a href="#terms">Terms</a> &amp; <a href="#privacy">Privacy Policy</a>
              </span>
            </label>

            {err && <p className="signup-error">{err}</p>}

            <button type="submit" className="signup-submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {otpSent ? 'Creating…' : 'Sending OTP…'}
                </>
              ) : otpSent ? (
                'Verify & Create Account'
              ) : (
                'Send OTP'
              )}
            </button>

            {otpSent && (
              <button
                type="button"
                className="signup-change-mobile"
                onClick={() => {
                  setOtpSent(false);
                  setOtp(['', '', '', '', '', '']);
                  setErr('');
                }}
              >
                Change mobile number
              </button>
            )}
          </form>

          <p className="signup-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}