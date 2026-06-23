'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function VerifyEmailClient() {
  const params = useSearchParams();
  const email = params.get('email') || '';
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function handleChange(i: number, v: string) {
    if (!/^\d?$/.test(v)) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    if (v && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
  }

  async function submit() {
    setErr('');
    try {
      await api.post('/auth/verify-email', { email, otp: otp.join('') });
      setMsg('Email verified! You can sign in.');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Verification failed');
    }
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-6">
      <div className="ui-card max-w-md w-full text-center">
        <h1 className="text-xl font-medium mb-2">Verify your email</h1>
        <p className="text-text-secondary text-sm mb-6">Enter the 6-digit code sent to {email || 'your email'}</p>
        <div className="flex gap-2 justify-center mb-6">
          {otp.map((d, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              className="ui-input !w-11 !h-12 text-center text-lg"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
            />
          ))}
        </div>
        {err && <p className="text-loss text-xs mb-3">{err}</p>}
        {msg && <p className="text-profit text-xs mb-3">{msg}</p>}
        <button className="btn-primary w-full" onClick={submit}>Verify</button>
        <p className="mt-4 text-xs"><Link href="/login" className="text-accent">Back to login</Link></p>
      </div>
    </div>
  );
}
