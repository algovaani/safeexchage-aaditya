import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api/client.js';
import BrandLogo from '../components/BrandLogo.jsx';
import './Login.css';
import './ForgotPassword.css';

const RESEND_SECONDS = 30;

export default function ForgotPassword() {
  const toast = useToast();
  const nav = useNavigate();

  const [step, setStep] = useState('mobile'); // 'mobile' | 'reset' | 'done'
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (resendIn <= 0) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [resendIn]);

  function startResendTimer() {
    setResendIn(RESEND_SECONDS);
  }

  // Step 1: request OTP for password reset
  async function requestOtp(e) {
    e?.preventDefault();
    setErr('');

    if (mobile.length !== 10) {
      const message = 'Enter a valid 10-digit mobile number';
      setErr(message);
      toast.warning(message);
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/forgot-password', {
        identifier: mobile,
      });
      toast.success('OTP sent to your mobile number');
      setOtp('');
      setPassword('');
      setConfirmPassword('');
      setStep('reset');
      startResendTimer();
    } catch (ex) {
      const message = ex.message || 'Could not send OTP. Please try again.';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (resendIn > 0 || busy) return;
  
    setErr('');
    setBusy(true);
  
    try {
      await api.post('/auth/forgot-password', {
        identifier: mobile,
      });
  
      toast.success('OTP resent');
      startResendTimer();
    } catch (ex) {
      const message = ex.message || 'Could not resend OTP. Please try again.';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  // Step 2: submit OTP + new password together
  async function resetPassword(e) {
    e.preventDefault();
    setErr('');

    if (otp.length !== 6) {
      const message = 'Enter the 6-digit OTP';
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

    setBusy(true);
    try {
      await api.post('/auth/reset-password', {
        identifier: mobile,
        otp,
        newPassword: password,
      });
      setStep('done');
      toast.success('Password reset successfully');
    } catch (ex) {
      const message = ex.message || 'Invalid OTP or could not reset password';
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function changeMobile() {
    setStep('mobile');
    setOtp('');
    setErr('');
    setResendIn(0);
  }

  return (
    <div className="login-page">
      <header className="login-nav">
        <div className="login-nav__inner">
          <Link to="/" className="login-nav__brand">
            <BrandLogo size="sm" />
          </Link>
          <Link to="/login" className="login-nav__signup">
            Sign in
          </Link>
        </div>
      </header>

      <main className="login-main login-main--center">
        <section className="login-card-wrap" aria-label="Reset password">
          <div className="login-card">
            {step === 'mobile' && (
              <>
                <h2 className="login-card__title">Forgot password?</h2>
                <p className="login-card__subtitle">
                  Enter your registered mobile number and we&apos;ll send you a one-time code
                </p>

                <form onSubmit={requestOtp}>
                  <div className="login-field">
                    <label htmlFor="fp-mobile">Mobile number</label>
                    <div className="login-mobile-row">
                      <span className="login-mobile-prefix">+91</span>
                      <input
                        id="fp-mobile"
                        type="tel"
                        autoComplete="tel"
                        placeholder="9876543210"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        required
                      />
                    </div>
                  </div>

                  {err && <p className="login-error">{err}</p>}

                  <button type="submit" className="login-submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Sending OTP…
                      </>
                    ) : (
                      'Send OTP'
                    )}
                  </button>
                </form>

                <p className="login-card__footer">
                  Remembered it? <Link to="/login">Sign in</Link>
                </p>
              </>
            )}

            {step === 'reset' && (
              <>
                <h2 className="login-card__title">Reset password</h2>
                <p className="login-card__subtitle">
                  Enter the OTP sent to <span className="fp-mobile-highlight">+91 {mobile}</span> and choose a new
                  password
                </p>

                <form onSubmit={resetPassword}>
                  <div className="login-field">
                    <label htmlFor="fp-otp">OTP</label>
                    <input
                      id="fp-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      className="fp-otp-input"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                    />
                  </div>

                  <div className="login-field">
                    <label htmlFor="fp-password">New password</label>
                    <div className="login-mobile-row">
                      <input
                        id="fp-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
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

                  <div className="login-field">
                    <label htmlFor="fp-confirm-password">Confirm new password</label>
                    <input
                      id="fp-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>

                  {err && <p className="login-error">{err}</p>}

                  <button type="submit" className="login-submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Resetting…
                      </>
                    ) : (
                      'Reset password'
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  className="login-resend"
                  onClick={resendOtp}
                  disabled={resendIn > 0 || busy}
                >
                  {resendIn > 0 ? `Resend OTP in ${resendIn}s` : 'Resend OTP'}
                </button>
                <button type="button" className="login-change-mobile" onClick={changeMobile}>
                  Change mobile number
                </button>
              </>
            )}

            {step === 'done' && (
              <div className="fp-success">
                <CheckCircle2 size={40} className="fp-success__icon" />
                <h2 className="login-card__title">Password reset</h2>
                <p className="login-card__subtitle">
                  Your password has been changed successfully. You can now sign in with your new password.
                </p>
                <button type="button" className="login-submit" onClick={() => nav('/login', { replace: true })}>
                  Back to sign in
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}