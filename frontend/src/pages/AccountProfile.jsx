import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Check, CheckCircle, Clock, XCircle, Loader2, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api, authAPI, parseApiResponse } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Card from '../components/ui/Card.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Input from '../components/ui/Input.jsx';
import FileUploadZone from '../components/ui/FileUploadZone.jsx';
import ReferEarn from './ReferEarn.jsx';

function profileInitial(profile) {
  const name = profile?.name?.trim();
  if (name) return name[0].toUpperCase();
  if (profile?.email) return profile.email[0].toUpperCase();
  if (profile?.mobile) return profile.mobile.replace(/\D/g, '').slice(-1) || '?';
  return '?';
}

function formatMobile(mobile) {
  if (!mobile) return '—';
  const digits = String(mobile).replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  if (ten.length === 10) return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
  return mobile;
}

function ProfileTab() {
  const toast = useToast();
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [kycStatus, setKycStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    bnbWalletAddress: '',
    ethWalletAddress: '',
    trcWalletAddress: '',
    usdtWalletAddress: '',
  });

  async function loadProfile() {
    setLoading(true);
    try {
      const [userData, kyc] = await Promise.all([
        authAPI.me(),
        api.get('/kyc/status').then((r) => parseApiResponse(r.data)).catch(() => ({ status: 'not_submitted' })),
      ]);
      setProfile(userData);
      setKycStatus(kyc);
      setForm({
        name: userData?.name || '',
        email: userData?.email || '',
        bnbWalletAddress: userData?.bnbWalletAddress || '',
        ethWalletAddress: userData?.ethWalletAddress || '',
        trcWalletAddress: userData?.trcWalletAddress || '',
        usdtWalletAddress: userData?.usdtWalletAddress || '',
      });
    } catch {
      toast.error('Could not load profile');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await authAPI.updateProfile(form);
      setProfile(updated);
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (ex) {
      toast.error(ex.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  const statusKey = kycStatus?.status || 'not_submitted';
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading profile…
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-start gap-4 mb-6">
            <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-accent/40 to-accent flex items-center justify-center text-2xl font-bold text-black shrink-0">
              {profileInitial(profile)}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-medium text-text-primary truncate">
                {form.name?.trim() || profile?.email?.split('@')[0] || 'Trader'}
              </p>
              <p className="text-sm text-text-secondary mt-0.5">Member since {memberSince}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <StatusBadge status={profile?.status || 'active'} />
                <StatusBadge status={statusKey} />
              </div>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <Input
              label="Display name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Your name"
              maxLength={120}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              maxLength={254}
              autoComplete="email"
            />
            {profile?.email && form.email.trim().toLowerCase() !== String(profile.email).toLowerCase() && (
              <p className="text-xs text-text-muted -mt-2">
                Changing email will reset email verification on your account.
              </p>
            )}
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">Mobile</p>
              <p className="text-text-primary tabular-nums">{formatMobile(profile?.mobile)}</p>
            </div>
            {profile?.referralCode && (
              <div>
                <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">Referral code</p>
                <p className="text-text-primary font-mono">{profile.referralCode}</p>
              </div>
            )}
            {kycStatus?.status === 'rejected' && kycStatus.adminNote && (
              <p className="text-xs text-loss">KYC note: {kycStatus.adminNote}</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-text-primary mb-1">Withdrawal wallets</h3>
          <p className="text-sm text-text-secondary mb-4">
            Used for deposits and withdrawals. Keep addresses accurate for your network.
          </p>
          <div className="space-y-3">
            <Input
              label="BNB (BEP20) address"
              value={form.bnbWalletAddress}
              onChange={(e) => setForm((f) => ({ ...f, bnbWalletAddress: e.target.value }))}
              placeholder="0x…"
            />
            <Input
              label="ETH (ERC20) address"
              value={form.ethWalletAddress}
              onChange={(e) => setForm((f) => ({ ...f, ethWalletAddress: e.target.value }))}
              placeholder="0x…"
            />
            <Input
              label="TRC20 address"
              value={form.trcWalletAddress}
              onChange={(e) => setForm((f) => ({ ...f, trcWalletAddress: e.target.value }))}
              placeholder="T…"
            />
            <Input
              label="USDT wallet (legacy)"
              value={form.usdtWalletAddress}
              onChange={(e) => setForm((f) => ({ ...f, usdtWalletAddress: e.target.value }))}
              placeholder="Optional"
            />
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="btn-primary min-w-[140px] flex items-center justify-center gap-2"
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </button>
      </div>
    </form>
  );
}

function SecurityTab() {
  const { user } = useAuth();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <h3 className="text-base font-semibold text-text-primary mb-2">Password</h3>
        <p className="text-sm text-text-secondary mb-4">
          Reset your password using OTP sent to your registered mobile number.
        </p>
        <Link to="/forgot-password" className="btn-primary inline-flex no-underline">
          Reset password
        </Link>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-text-primary mb-4">Account security</h3>
        <ul className="space-y-3 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Mobile verified</span>
            <StatusBadge status={user?.mobileVerified ? 'approved' : 'pending'} />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Email verified</span>
            <StatusBadge status={user?.emailVerified ? 'approved' : 'pending'} />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Account status</span>
            <StatusBadge status={user?.status || 'active'} />
          </li>
        </ul>
      </Card>
    </div>
  );
}

function KycStatusBanner({ status, adminNote }) {
  const key = status || 'not_submitted';

  if (key === 'pending') {
    return (
      <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-xl p-4 flex items-start gap-3 mb-6">
        <Clock className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary font-medium text-sm">Verification Under Review</p>
          <p className="text-text-secondary text-sm mt-0.5">
            We&apos;ll notify you within 24–48 hours
          </p>
        </div>
      </div>
    );
  }

  if (key === 'approved') {
    return (
      <div className="border border-profit/20 bg-profit/5 rounded-xl p-4 flex items-start gap-3 mb-6">
        <CheckCircle className="w-5 h-5 text-profit shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary font-medium text-sm">Identity Verified</p>
          <p className="text-text-secondary text-sm mt-0.5">Your account is fully verified</p>
        </div>
      </div>
    );
  }

  if (key === 'rejected') {
    return (
      <div className="border border-loss/20 bg-loss/5 rounded-xl p-4 flex items-start gap-3 mb-6">
        <XCircle className="w-5 h-5 text-loss shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary font-medium text-sm">Verification Rejected</p>
          {adminNote && (
            <p className="text-text-secondary text-sm mt-1">{adminNote}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-tertiary border border-border rounded-xl p-4 flex items-start gap-3 mb-6">
      <Clock className="w-5 h-5 text-accent shrink-0 mt-0.5" />
      <div>
        <p className="text-text-primary font-medium text-sm">Identity Verification (Optional)</p>
        <p className="text-text-secondary text-sm mt-0.5">
          KYC is optional — you can trade and withdraw without it. Submit anytime for added account trust.
        </p>
      </div>
    </div>
  );
}

function KycStepIndicator({ currentStep }) {
  const steps = ['Select Document', 'Upload Files', 'Submit'];

  return (
    <div className="flex items-center justify-between mb-8 max-w-lg">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const done = stepNum < currentStep;
        const active = stepNum === currentStep;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  done
                    ? 'bg-profit text-black'
                    : active
                      ? 'bg-accent text-black'
                      : 'bg-border text-text-secondary'
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : stepNum}
              </div>
              <span className={`text-xs hidden sm:block ${active ? 'text-text-primary' : 'text-text-secondary'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-5 ${done ? 'bg-profit' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function KycTab() {
  const toast = useToast();
  const [docType, setDocType] = useState('passport');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [filesReady, setFilesReady] = useState({ doc_front: false, selfie: false, address_proof: false });

  async function loadStatus() {
    const { data } = await api.get('/kyc/status');
    setStatus(parseApiResponse(data));
  }

  useEffect(() => {
    loadStatus().catch(() => setStatus({ status: 'not_submitted' }));
  }, []);

  const currentStep = useMemo(() => {
    const requiredReady = filesReady.doc_front && filesReady.selfie && filesReady.address_proof;
    if (requiredReady) return 3;
    if (Object.values(filesReady).some(Boolean)) return 2;
    return 1;
  }, [filesReady]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const form = new FormData(e.target);
      form.set('doc_type', docType);
      await api.post('/kyc/submit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadStatus();
    } catch (ex) {
      const message = ex.response?.data?.message || ex.message || 'Could not submit KYC';
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  const blocked = status?.status === 'pending' || status?.status === 'approved';
  const statusKey = status?.status || 'not_submitted';

  function markFile(name, file) {
    setFilesReady((prev) => ({ ...prev, [name]: !!file }));
  }

  return (
    <div>
      <KycStatusBanner status={statusKey} adminNote={status?.adminNote} />

      {status?.submittedAt && statusKey !== 'not_submitted' && (
        <p className="text-sm text-text-secondary mb-4">
          Submitted {new Date(status.submittedAt).toLocaleString()}
        </p>
      )}

      {blocked ? (
        <Card padding="p-6">
          <p className="text-text-secondary text-sm">
            You cannot submit again while KYC is <StatusBadge status={statusKey} className="ml-1" />.
          </p>
        </Card>
      ) : (
        <>
          {statusKey === 'not_submitted' || statusKey === 'rejected' ? (
            <KycStepIndicator currentStep={currentStep} />
          ) : null}

          <Card padding="p-8">
            <form onSubmit={onSubmit}>
              <div className="mb-6">
                <label
                  htmlFor="doc_type"
                  className="block text-xs text-text-secondary uppercase tracking-wider mb-2"
                >
                  Document Type
                </label>
                <div className="relative">
                  <select
                    id="doc_type"
                    value={docType}
                    onChange={(ev) => setDocType(ev.target.value)}
                    className="w-full appearance-none bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-sm text-text-primary hover:border-border-hover focus:border-accent focus:outline-none transition-all duration-150 pr-10"
                  >
                    <option value="passport">Passport</option>
                    <option value="driving_license">Driving License</option>
                    <option value="national_id">National ID</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-accent pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <FileUploadZone
                  id="doc_front"
                  name="doc_front"
                  title="Document Front"
                  required
                  onFileChange={(f) => markFile('doc_front', f)}
                />
                <FileUploadZone
                  id="doc_back"
                  name="doc_back"
                  title="Document Back"
                  optional
                  onFileChange={(f) => markFile('doc_back', f)}
                />
                <FileUploadZone
                  id="selfie"
                  name="selfie"
                  title="Selfie Photo"
                  required
                  onFileChange={(f) => markFile('selfie', f)}
                />
                <FileUploadZone
                  id="address_proof"
                  name="address_proof"
                  title="Address Proof"
                  required
                  onFileChange={(f) => markFile('address_proof', f)}
                />
              </div>

              {err && <p className="text-sm text-loss mb-3">{err}</p>}

              <button
                type="submit"
                className="w-full bg-accent hover:bg-accent-hover text-black font-semibold py-4 rounded-xl text-base transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Verification'
                )}
              </button>

              <p className="text-xs text-text-muted text-center mt-3">
                🔒 Your documents are encrypted and securely stored
              </p>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function PlaceholderTab({ title }) {
  return (
    <Card>
      <p className="text-text-secondary text-sm">{title} — coming soon.</p>
    </Card>
  );
}

function SubTab({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative px-4 py-3 text-sm cursor-pointer transition-colors duration-150 whitespace-nowrap ${
          isActive ? 'text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {children}
          {isActive && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
          )}
        </>
      )}
    </NavLink>
  );
}

export default function AccountProfile() {
  const SETTINGS_NAV = [
    { to: '/account/profile', end: true, label: 'Profile' },
    { to: '/account/profile/security', label: 'Security' },
    { to: '/account/profile/kyc', label: 'KYC Verification (Optional)' },
    { to: '/account/profile/refer', label: 'Refer & Earn' },
    { to: '/account/profile/notifications', label: 'Notifications' },
    { to: '/account/profile/preferences', label: 'Preferences' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-text-primary mb-1">Settings</h1>
        <p className="text-sm text-text-secondary">Profile, security, and verification</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <nav className="ui-card !p-3 flex flex-row lg:flex-col gap-1 overflow-x-auto">
          {SETTINGS_NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-btn text-sm whitespace-nowrap transition-all duration-150 no-underline ${
                  isActive
                    ? 'bg-bg-tertiary text-text-primary border-l-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
            
        <div>
          <Routes>
            <Route index element={<ProfileTab />} />
            <Route path="security" element={<SecurityTab />} />
            <Route path="kyc" element={<KycTab />} />
            <Route path="notifications" element={<PlaceholderTab title="Notifications" />} />
            <Route path="api" element={<Navigate to="/account/profile" replace />} />
            <Route path="preferences" element={<PlaceholderTab title="Preferences" />} />
            <Route path="whitelist" element={<PlaceholderTab title="Whitelist" />} />
            <Route path="refer" element={<ReferEarn embedded />} />
            <Route path="support" element={<PlaceholderTab title="Support" />} />
            <Route path="*" element={<Navigate to="/account/profile" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
