import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

function ProfileTab() {
  const { user } = useAuth();
  const [kyc, setKyc] = useState([]);

  useEffect(() => {
    api
      .get('/kyc/me')
      .then((r) => setKyc(r.data))
      .catch(() => setKyc([]));
  }, []);

  const kycLabel =
    kyc.length === 0 ? 'NOT SUBMITTED' : kyc.some((x) => x.status === 'approved') ? 'APPROVED' : 'PENDING';

  return (
    <div className="ex-profile-grid">
      <div className="ex-profile-card">
        <div className="ex-profile-avatar" aria-hidden>
          {user?.email?.[0]?.toUpperCase() ?? '?'}
        </div>
        <p>
          <strong>Email</strong>
          <br />
          <span className="ex-muted">{user?.email ? '••••••@••••' : '—'}</span>
        </p>
        <p>
          <strong>Mobile No.</strong>
          <br />
          <span className="ex-muted">—</span>
        </p>
        <p>
          <strong>KYC</strong>
          <br />
          <span className={`ex-kyc-badge ${kycLabel === 'APPROVED' ? 'is-ok' : ''}`}>{kycLabel}</span>
        </p>
        <button type="button" className="ex-pill-btn ex-pill-btn--danger" disabled>
          Delete User
        </button>
      </div>

      <div className="ex-profile-card">
        <h3>Change Password</h3>
        <div className="field">
          <label>Old Password</label>
          <input type="password" disabled placeholder="Not available in demo" />
        </div>
        <div className="field">
          <label>New Password</label>
          <input type="password" disabled />
        </div>
        <div className="field">
          <label>Confirm New Password</label>
          <input type="password" disabled />
        </div>
        <button type="button" className="ex-pill-btn" disabled>
          Change Password
        </button>
      </div>

      <div className="ex-profile-card">
        <h3>Google Authentication</h3>
        <p className="ex-muted">2FA setup (demo — disabled).</p>
        <div className="ex-fake-qr" aria-hidden>
          QR
        </div>
        <p>
          Status: <strong>Disabled</strong>
        </p>
        <div className="field">
          <label>Authentication Code</label>
          <input disabled placeholder="—" />
        </div>
        <button type="button" className="ex-pill-btn" disabled>
          Enable
        </button>
      </div>
    </div>
  );
}

function KycTab() {
  return (
    <div className="ex-panel-light">
      <p className="ex-muted">Upload documents under KYC from the API-backed flow (coming soon in UI).</p>
      <p>
        Use <strong>POST /api/kyc</strong> with multipart file or extend this screen with an upload form.
      </p>
    </div>
  );
}

function PlaceholderTab({ title }) {
  return (
    <div className="ex-panel-light">
      <p className="ex-muted">{title} — coming soon.</p>
    </div>
  );
}

export default function AccountProfile() {
  return (
    <div className="ex-page">
      <div className="ex-subnav">
        <NavLink to="/account/profile" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Profile
        </NavLink>
        <NavLink to="/account/profile/kyc" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          KYC
        </NavLink>
        <NavLink to="/account/profile/whitelist" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Whitelist
        </NavLink>
        <NavLink to="/account/profile/refer" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Refer &amp; Earn
        </NavLink>
        <NavLink to="/account/profile/support" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Support
        </NavLink>
      </div>

      <Routes>
        <Route index element={<ProfileTab />} />
        <Route path="kyc" element={<KycTab />} />
        <Route path="whitelist" element={<PlaceholderTab title="Whitelist" />} />
        <Route path="refer" element={<PlaceholderTab title="Refer & Earn" />} />
        <Route path="support" element={<PlaceholderTab title="Support" />} />
        <Route path="*" element={<Navigate to="/account/profile" replace />} />
      </Routes>
    </div>
  );
}
