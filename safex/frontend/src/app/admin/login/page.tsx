'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, unwrap, type AuthPayload } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function AdminLoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [err, setErr] = useState('');

  async function handleLogin() {
    setErr('');
    try {
      const res = await api.post('/admin/auth/login', {
        email,
        password,
        otp: otpSent ? otp.join('') : undefined,
      });
      const data = unwrap<{ otpSent?: boolean; user?: AuthPayload['user']; accessToken?: string; refreshToken?: string }>(res);
      if (data.otpSent) {
        setOtpSent(true);
        return;
      }
      setAuth(data.user!, data.accessToken!, data.refreshToken!);
      router.push('/admin');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    }
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-6">
      <div className="ui-card w-[360px]">
        <span className="inline-block text-[10px] uppercase tracking-wider bg-amber/20 text-amber px-2 py-1 rounded-full mb-4">
          Admin Access Only
        </span>
        <h1 className="text-lg font-medium mb-6">Admin Login</h1>
        <div className="space-y-4">
          <div>
            <label className="ui-label">Admin Email</label>
            <input className="ui-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="ui-label">Password</label>
            <input className="ui-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {otpSent && (
            <div>
              <label className="ui-label">6-digit OTP</label>
              <div className="flex gap-1">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    className="ui-input !w-10 text-center"
                    maxLength={1}
                    value={d}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      const next = [...otp];
                      next[i] = v;
                      setOtp(next);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {err && <p className="text-loss text-xs">{err}</p>}
          <button className="btn-primary w-full" onClick={handleLogin}>
            {otpSent ? 'Verify & Sign in' : 'Send OTP & Continue'}
          </button>
        </div>
        <p className="text-center text-xs text-text-secondary mt-5">
          <Link href="/login" className="text-accent">User login</Link>
        </p>
      </div>
    </div>
  );
}
