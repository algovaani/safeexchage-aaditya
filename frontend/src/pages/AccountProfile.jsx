import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Check, CheckCircle, Clock, XCircle, Loader2, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import Card from '../components/ui/Card.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Input from '../components/ui/Input.jsx';
import FileUploadZone from '../components/ui/FileUploadZone.jsx';

function ProfileTab() {
  const { user } = useAuth();
  const [kycStatus, setKycStatus] = useState(null);

  useEffect(() => {
    api
      .get('/kyc/status')
      .then((r) => setKycStatus(parseApiResponse(r.data)))
      .catch(() => setKycStatus({ status: 'not_submitted' }));
  }, []);

  const statusKey = kycStatus?.status || 'not_submitted';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card>
        <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-accent/40 to-accent flex items-center justify-center text-2xl font-bold text-black mb-4">
          {user?.email?.[0]?.toUpperCase() ?? user?.mobile?.[0] ?? '?'}
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">Email</p>
            <p className="text-text-primary">{user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">Mobile No.</p>
            <p className="text-text-primary">{user?.mobile || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">KYC</p>
            <StatusBadge status={statusKey} />
          </div>
          {kycStatus?.status === 'rejected' && kycStatus.adminNote && (
            <p className="text-xs text-text-secondary">Note: {kycStatus.adminNote}</p>
          )}
        </div>
        <button
          type="button"
          className="mt-6 w-full py-2.5 rounded-lg bg-loss/10 text-loss border border-loss/20 text-sm font-medium opacity-50 cursor-not-allowed"
          disabled
        >
          Delete User
        </button>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-text-primary mb-4">Change Password</h3>
        <Input label="Old Password" type="password" disabled placeholder="Not available in demo" />
        <Input label="New Password" type="password" disabled className="mt-3" />
        <Input label="Confirm New Password" type="password" disabled className="mt-3" />
        <button
          type="button"
          className="mt-4 w-full py-2.5 rounded-xl bg-bg-tertiary border border-border text-text-secondary text-sm font-medium opacity-50 cursor-not-allowed"
          disabled
        >
          Change Password
        </button>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-text-primary mb-2">Google Authentication</h3>
        <p className="text-sm text-text-secondary mb-4">2FA setup (demo — disabled).</p>
        <div className="w-[120px] h-[120px] bg-bg-tertiary border border-border rounded-lg flex items-center justify-center text-text-secondary font-bold mb-4">
          QR
        </div>
        <p className="text-sm text-text-primary mb-4">
          Status: <strong className="text-text-secondary">Disabled</strong>
        </p>
        <Input label="Authentication Code" disabled placeholder="—" />
        <button
          type="button"
          className="mt-4 w-full py-2.5 rounded-xl bg-bg-tertiary border border-border text-text-secondary text-sm font-medium opacity-50 cursor-not-allowed"
          disabled
        >
          Enable
        </button>
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
      <Clock className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-text-primary font-medium text-sm">Identity Verification Required</p>
        <p className="text-text-secondary text-sm mt-0.5">
          Complete KYC to unlock trading and withdrawals
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
  const [docType, setDocType] = useState('passport');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
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
    setMsg('');
    setBusy(true);
    try {
      const form = new FormData(e.target);
      form.set('doc_type', docType);
      await api.post('/kyc/submit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMsg('KYC submitted. Admin will review shortly.');
      await loadStatus();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Could not submit KYC');
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
              {msg && <p className="text-sm text-profit mb-3">{msg}</p>}

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
    { to: '/account/profile/kyc', label: 'KYC Verification' },
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
            <Route path="security" element={<ProfileTab />} />
            <Route path="kyc" element={<KycTab />} />
            <Route path="notifications" element={<PlaceholderTab title="Notifications" />} />
            <Route path="api" element={<Navigate to="/account/profile" replace />} />
            <Route path="preferences" element={<PlaceholderTab title="Preferences" />} />
            <Route path="whitelist" element={<PlaceholderTab title="Whitelist" />} />
            <Route path="refer" element={<PlaceholderTab title="Refer & Earn" />} />
            <Route path="support" element={<PlaceholderTab title="Support" />} />
            <Route path="*" element={<Navigate to="/account/profile" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
