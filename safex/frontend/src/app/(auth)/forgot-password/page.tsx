'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function sendOtp() {
    setErr('');
    try {
      await api.post('/auth/forgot-password', { email });
      setStep(2);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function reset() {
    setErr('');
    try {
      await api.post('/auth/reset-password', { email, otp, newPassword: password });
      setMsg('Password reset. You can sign in.');
      setStep(3);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-6">
      <div className="ui-card max-w-md w-full">
        <h1 className="text-xl font-medium mb-1">Reset password</h1>
        <p className="text-text-secondary text-xs mb-6">Step {step} of 3</p>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="ui-label">Email</label>
              <input className="ui-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn-primary w-full" onClick={sendOtp}>Send OTP</button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="ui-label">OTP</label>
              <input className="ui-input" value={otp} onChange={(e) => setOtp(e.target.value)} />
            </div>
            <div>
              <label className="ui-label">New password</label>
              <input className="ui-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn-primary w-full" onClick={reset}>Reset password</button>
          </div>
        )}
        {step === 3 && <p className="text-profit text-sm">{msg}</p>}
        {err && <p className="text-loss text-xs mt-3">{err}</p>}
        <p className="mt-4 text-xs text-center"><Link href="/login" className="text-accent">Back to login</Link></p>
      </div>
    </div>
  );
}
