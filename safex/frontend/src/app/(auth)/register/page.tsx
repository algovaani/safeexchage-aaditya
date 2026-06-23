'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api, unwrap } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import BrandLogo from '@/components/BrandLogo';

const schema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    mobile: z.string().optional(),
    password: z
      .string()
      .min(8)
      .regex(/[A-Z]/, 'Uppercase required')
      .regex(/[0-9]/, 'Number required')
      .regex(/[^A-Za-z0-9]/, 'Special char required'),
    confirm: z.string(),
    agreed: z.boolean().refine((v) => v === true, { message: 'You must agree to terms' }),
  })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

type Form = z.infer<typeof schema>;

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const pw = watch('password') || '';
  const str = strength(pw);
  const labels = ['', 'Weak', 'Medium', 'Strong', 'Very Strong'];

  async function onSubmit(data: Form) {
    setErr('');
    try {
      const body = {
        name: data.name,
        email: data.email,
        password: data.password,
        ...(data.mobile?.trim() ? { mobile: data.mobile.startsWith('+') ? data.mobile : `+91${data.mobile}` } : {}),
      };
      const res = await api.post('/auth/register', body);
      const payload = unwrap<import('@/lib/api').AuthPayload>(res);
      setAuth(payload.user, payload.accessToken, payload.refreshToken);
      router.push(`/verify-email?email=${encodeURIComponent(body.email)}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <header className="h-[60px] border-b border-border flex items-center justify-between px-6 bg-secondary">
        <Link href="/" className="flex items-center no-underline">
          <BrandLogo size="sm" />
        </Link>
        <Link href="/login" className="text-sm text-text-secondary no-underline hover:text-accent">
          Sign in
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="ui-card w-full max-w-[480px]">
          <h1 className="text-xl font-medium mb-1">Create your account</h1>
          <p className="text-text-secondary text-xs mb-6">Join millions of traders on SafeXchange</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="ui-label">Full Name</label>
              <input className="ui-input" {...register('name')} />
              {errors.name && <p className="text-loss text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="ui-label">Email Address</label>
              <input className="ui-input" type="email" {...register('email')} />
            </div>
            <div>
              <label className="ui-label">Mobile (+91)</label>
              <input className="ui-input" placeholder="9876543210" {...register('mobile')} />
            </div>
            <div className="relative">
              <label className="ui-label">Password</label>
              <input className="ui-input pr-10" type={showPw ? 'text' : 'password'} {...register('password')} />
              <button type="button" className="absolute right-3 bottom-2.5 text-text-secondary" onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {pw && (
                <div className="mt-2 flex gap-1 items-center">
                  {[1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded ${i <= str ? (str <= 1 ? 'bg-loss' : str === 2 ? 'bg-amber' : str === 3 ? 'bg-accent' : 'bg-profit') : 'bg-tertiary'}`}
                    />
                  ))}
                  <span className="text-[10px] text-text-muted ml-2">{labels[str]}</span>
                </div>
              )}
            </div>
            <div>
              <label className="ui-label">Confirm Password</label>
              <input className="ui-input" type="password" {...register('confirm')} />
              {errors.confirm && <p className="text-loss text-xs mt-1">{errors.confirm.message}</p>}
            </div>
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input type="checkbox" className="mt-0.5" {...register('agreed')} />
              I agree to Terms &amp; Privacy Policy
            </label>
            {err && <p className="text-loss text-xs">{err}</p>}
            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-xs text-text-secondary mt-5">
            Already have an account? <Link href="/login" className="text-accent">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
