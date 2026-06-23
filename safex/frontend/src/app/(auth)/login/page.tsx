'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import BrandLogo from '@/components/BrandLogo';

const schema = z.object({
  emailOrMobile: z.string().min(3),
  password: z.string().min(1),
});

type Form = z.infer<typeof schema>;

const TICKERS = [
  { s: 'BTC', p: '68,420', c: '+2.14%', up: true },
  { s: 'ETH', p: '3,512', c: '+1.82%', up: true },
  { s: 'NIFTY', p: '24,850', c: '+0.42%', up: true },
  { s: 'SENSEX', p: '81,432', c: '-0.18%', up: false },
  { s: 'USDINR', p: '83.24', c: '+0.05%', up: true },
];

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: Form) {
    setErr('');
    try {
      const res = await api.post('/auth/login', data);
      const payload = unwrap<import('@/lib/api').AuthPayload>(res);
      setAuth(payload.user, payload.accessToken, payload.refreshToken);
      router.push(payload.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    }
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <header className="h-[60px] border-b border-border flex items-center justify-between px-6 bg-secondary">
        <Link href="/" className="flex items-center no-underline">
          <BrandLogo size="sm" />
        </Link>
        <Link href="/register" className="btn-primary !h-9 !text-xs no-underline px-4">
          Sign up
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[960px] grid lg:grid-cols-[1fr_320px] gap-12 items-center">
          <section>
            <h1 className="text-3xl lg:text-4xl font-medium mb-3">
              Trade smarter. <span className="text-accent">Earn faster.</span>
            </h1>
            <p className="text-text-secondary max-w-md mb-10">
              Real-time markets, deep liquidity, and zero hidden fees on SafeXchange.
            </p>
            <div className="flex flex-wrap gap-8">
              {[
                { v: '2.4M+', l: 'Active traders' },
                { v: '$8.2B', l: 'Daily volume' },
                { v: '0.02%', l: 'Maker fee' },
              ].map((s) => (
                <div key={s.l}>
                  <p className="text-2xl font-medium">{s.v}</p>
                  <p className="text-[11px] uppercase tracking-wider text-text-secondary">{s.l}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="ui-card w-[320px] justify-self-center lg:justify-self-end">
            <h2 className="text-lg font-medium mb-1">Welcome back</h2>
            <p className="text-text-secondary text-xs mb-6">Sign in to your SafeXchange account</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="ui-label">Email or mobile</label>
                <input className="ui-input" {...register('emailOrMobile')} placeholder="you@email.com" />
              </div>
              <div className="relative">
                <label className="ui-label">Password</label>
                <input
                  className="ui-input pr-10"
                  type={showPw ? 'text' : 'password'}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 bottom-2.5 text-text-secondary"
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="text-right">
                <Link href="/forgot-password" className="text-xs text-amber no-underline">
                  Forgot password?
                </Link>
              </div>
              {err && <p className="text-loss text-xs">{err}</p>}
              <button type="submit" className="btn-primary w-full !font-bold" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-5 text-xs text-text-muted">
              <span className="flex-1 h-px bg-border" />
              or continue with
              <span className="flex-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary !h-9 !text-xs" disabled>
                Google
              </button>
              <button type="button" className="btn-secondary !h-9 !text-xs" disabled>
                Apple
              </button>
            </div>

            <p className="text-center text-xs text-text-secondary mt-5">
              No account? <Link href="/register" className="text-accent">Sign up</Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-[#0a0c10] overflow-hidden">
        <div className="flex animate-none py-2">
          {TICKERS.map((t) => (
            <div key={t.s} className="flex items-center gap-2 px-6 text-xs border-r border-border whitespace-nowrap">
              <span className="font-semibold">{t.s}</span>
              <span className="text-text-secondary">{t.p}</span>
              <span className={t.up ? 'text-profit' : 'text-loss'}>{t.c}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
