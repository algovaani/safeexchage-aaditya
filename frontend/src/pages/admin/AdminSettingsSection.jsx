import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Building2,
  Check,
  Copy,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  FileCheck,
  Image as ImageIcon,
  Key,
  Loader2,
  QrCode,
  RefreshCw,
  Save,
  Shield,
  Smartphone,
  Trash2,
  UploadCloud,
  Wallet,
} from 'lucide-react';
import { adminSettingsAPI } from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { resolveAssetUrl } from '../../utils/assetUrl.js';
import './AdminSettingsSection.css';

const POPULAR_BANKS = [
  'State Bank of India (SBI)',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'IndusInd Bank',
  'Yes Bank',
];

export default function AdminSettingsSection() {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('bank');
  const [isDragging, setIsDragging] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // Secret toggles
  const [showSecrets, setShowSecrets] = useState({
    evmMnemonic: false,
    bnbKey: false,
    ethKey: false,
    trcKey: false,
  });

  const [form, setForm] = useState({
    // Bank & UPI
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    bankAccountHolder: '',
    bankUpiId: '',
    bankQrCode: '',
    showAdminPaymentAccount: true,

    // Rates & Economics
    usdtInrRate: '83.5',
    referralRewardUsdt: '0',
    cashInPersonDepositRate: '0',
    cashInPersonWithdrawRate: '0',

    // Crypto addresses & keys
    bnbWalletAddress: '',
    ethWalletAddress: '',
    trcWalletAddress: '',
    usdtWalletAddress: '',
    bnbPrivateKey: '',
    ethPrivateKey: '',
    trcPrivateKey: '',
    evmMnemonic: '',
  });

  const [meta, setMeta] = useState({
    hasBnbPrivateKey: false,
    hasEthPrivateKey: false,
    hasTrcPrivateKey: false,
    hasEvmMnemonic: false,
    updatedAt: null,
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminSettingsAPI.get();
      const s = data || {};
      const bank = s.bank || {};

      setForm({
        bankName: s.bankName || bank.name || '',
        bankAccountNumber: s.bankAccountNumber || bank.account || '',
        bankIfsc: s.bankIfsc || bank.ifsc || '',
        bankBranch: s.bankBranch || bank.branch || '',
        bankAccountHolder: s.bankAccountHolder || bank.holder || '',
        bankUpiId: s.bankUpiId || bank.upiId || '',
        bankQrCode: s.bankQrCode || bank.qrCode || '',
        showAdminPaymentAccount:
          s.showAdminPaymentAccount !== undefined
            ? Boolean(s.showAdminPaymentAccount)
            : bank.showAdminPaymentAccount !== undefined
            ? Boolean(bank.showAdminPaymentAccount)
            : bank.showAccount !== undefined
            ? Boolean(bank.showAccount)
            : true,

        usdtInrRate: s.usdtInrRate != null ? String(s.usdtInrRate) : '83.5',
        referralRewardUsdt: s.referralRewardUsdt != null ? String(s.referralRewardUsdt) : '0',
        cashInPersonDepositRate:
          s.cashInPersonDepositRate != null ? String(s.cashInPersonDepositRate) : '0',
        cashInPersonWithdrawRate:
          s.cashInPersonWithdrawRate != null ? String(s.cashInPersonWithdrawRate) : '0',

        bnbWalletAddress: s.bnbWalletAddress || '',
        ethWalletAddress: s.ethWalletAddress || '',
        trcWalletAddress: s.trcWalletAddress || '',
        usdtWalletAddress: s.usdtWalletAddress || '',
        bnbPrivateKey: s.bnbPrivateKey || '',
        ethPrivateKey: s.ethPrivateKey || '',
        trcPrivateKey: s.trcPrivateKey || '',
        evmMnemonic: s.evmMnemonic || '',
      });

      setMeta({
        hasBnbPrivateKey: Boolean(s.hasBnbPrivateKey),
        hasEthPrivateKey: Boolean(s.hasEthPrivateKey),
        hasTrcPrivateKey: Boolean(s.hasTrcPrivateKey),
        hasEvmMnemonic: Boolean(s.hasEvmMnemonic),
        updatedAt: s.updatedAt,
      });
    } catch (err) {
      toast.error(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function handleChange(field, val) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function copyText(text, key) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  // Handle QR code image file upload
  async function handleFileUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning('Please select an image file (PNG, JPG, WebP, SVG)');
      return;
    }

    setQrUploading(true);
    try {
      const fd = new FormData();
      fd.append('qrCode', file);
      const res = await adminSettingsAPI.uploadQr(fd);
      const newUrl = res?.qrCodeUrl || '';
      setForm((prev) => ({ ...prev, bankQrCode: newUrl }));
      toast.success('QR Code uploaded and saved successfully');
      window.dispatchEvent(new CustomEvent('platform:config-updated'));
    } catch (err) {
      toast.error(err.message || 'Failed to upload QR code image');
    } finally {
      setQrUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveQr() {
    if (!form.bankQrCode) return;
    const confirmed = window.confirm('Are you sure you want to delete the uploaded QR scan code?');
    if (!confirmed) return;

    setQrUploading(true);
    try {
      await adminSettingsAPI.removeQr();
      setForm((prev) => ({ ...prev, bankQrCode: '' }));
      toast.success('QR code removed');
      window.dispatchEvent(new CustomEvent('platform:config-updated'));
    } catch (err) {
      toast.error(err.message || 'Failed to remove QR code');
    } finally {
      setQrUploading(false);
    }
  }

  const [toggleBusy, setToggleBusy] = useState(false);

  async function handleToggleVisibility(nextVal) {
    if (toggleBusy) return;
    setToggleBusy(true);
    setForm((prev) => ({ ...prev, showAdminPaymentAccount: nextVal }));
    try {
      await adminSettingsAPI.update({ showAdminPaymentAccount: nextVal });
      toast.success(
        nextVal
          ? 'Admin Official Payment Account is now VISIBLE to users'
          : 'Admin Official Payment Account is now HIDDEN from users'
      );
      window.dispatchEvent(new CustomEvent('platform:config-updated'));
    } catch (err) {
      setForm((prev) => ({ ...prev, showAdminPaymentAccount: !nextVal }));
      toast.error(err.message || 'Failed to update visibility setting');
    } finally {
      setToggleBusy(false);
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        bankName: form.bankName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankIfsc: form.bankIfsc.trim().toUpperCase(),
        bankBranch: form.bankBranch.trim(),
        bankAccountHolder: form.bankAccountHolder.trim(),
        bankUpiId: form.bankUpiId.trim(),
        bankQrCode: form.bankQrCode.trim(),
        showAdminPaymentAccount: Boolean(form.showAdminPaymentAccount),

        usdtInrRate: Number(form.usdtInrRate || 83.5),
        referralRewardUsdt: Number(form.referralRewardUsdt || 0),
        cashInPersonDepositRate: Number(form.cashInPersonDepositRate || 0),
        cashInPersonWithdrawRate: Number(form.cashInPersonWithdrawRate || 0),

        bnbWalletAddress: form.bnbWalletAddress.trim(),
        ethWalletAddress: form.ethWalletAddress.trim(),
        trcWalletAddress: form.trcWalletAddress.trim(),
        usdtWalletAddress: form.usdtWalletAddress.trim(),
      };

      if (form.bnbPrivateKey.trim()) payload.bnbPrivateKey = form.bnbPrivateKey.trim();
      if (form.ethPrivateKey.trim()) payload.ethPrivateKey = form.ethPrivateKey.trim();
      if (form.trcPrivateKey.trim()) payload.trcPrivateKey = form.trcPrivateKey.trim();
      if (form.evmMnemonic.trim()) payload.evmMnemonic = form.evmMnemonic.trim();

      const saved = await adminSettingsAPI.update(payload);
      toast.success('All settings saved successfully');

      if (saved) {
        setMeta({
          hasBnbPrivateKey: Boolean(saved.hasBnbPrivateKey),
          hasEthPrivateKey: Boolean(saved.hasEthPrivateKey),
          hasTrcPrivateKey: Boolean(saved.hasTrcPrivateKey),
          hasEvmMnemonic: Boolean(saved.hasEvmMnemonic),
          updatedAt: saved.updatedAt,
        });
      }

      window.dispatchEvent(new CustomEvent('platform:config-updated'));
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-settings-loading">
        <Loader2 size={36} className="admin-spin text-accent" />
        <span>Loading platform settings…</span>
      </div>
    );
  }

  const resolvedQrUrl = form.bankQrCode ? resolveAssetUrl(form.bankQrCode) : '';
  const upiIntentUri = form.bankUpiId
    ? `upi://pay?pa=${encodeURIComponent(form.bankUpiId)}&pn=${encodeURIComponent(
        form.bankAccountHolder || 'SafeXchange'
      )}&cu=INR`
    : '';

  return (
    <div className="admin-settings-container">
      {/* Hero Header */}
      <div className="admin-settings-hero">
        <div className="admin-settings-hero__info">
          <h1>
            <Building2 className="text-accent" size={24} />
            Platform &amp; Payment Settings
          </h1>
          <p>
            Configure official platform bank transfer details, upload payment QR scan code for user INR deposits,
            set live currency conversion rates, and manage crypto hot wallets.
          </p>
        </div>
        <div className="admin-settings-hero__actions">
          <button
            type="button"
            className="admin-btn admin-btn--ghost flex items-center gap-1.5"
            onClick={loadSettings}
            disabled={saving || qrUploading}
            title="Reload settings from database"
          >
            <RefreshCw size={15} /> Reload
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary flex items-center gap-1.5"
            onClick={handleSave}
            disabled={saving || qrUploading}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="admin-spin" /> Saving…
              </>
            ) : (
              <>
                <Save size={16} /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="admin-settings-tabs">
        <button
          type="button"
          className={`admin-settings-tab${activeTab === 'bank' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('bank')}
        >
          <CreditCard size={16} />
          Bank Details &amp; QR Scan Code
          {form.showAdminPaymentAccount ? (
            <span className="admin-settings-card__badge admin-settings-card__badge--ok">Active</span>
          ) : (
            <span
              className="admin-settings-card__badge"
              style={{
                borderColor: 'rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                background: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              Hidden
            </span>
          )}
        </button>

        <button
          type="button"
          className={`admin-settings-tab${activeTab === 'rates' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('rates')}
        >
          <DollarSign size={16} />
          Rates &amp; Referral Rewards
          <span className="admin-settings-card__badge">₹{form.usdtInrRate}</span>
        </button>

        <button
          type="button"
          className={`admin-settings-tab${activeTab === 'crypto' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('crypto')}
        >
          <Wallet size={16} />
          Crypto Wallets &amp; Secrets
          {meta.hasEvmMnemonic && (
            <span className="admin-settings-card__badge admin-settings-card__badge--ok">Mnemonic Set</span>
          )}
        </button>
      </div>

      {/* Tab 1: Bank Details & QR Scan Code */}
      {activeTab === 'bank' && (
        <div className="admin-settings-grid">
          {/* Top Span: Visibility Switch Banner Card */}
          <div
            className={`admin-visibility-card ${
              form.showAdminPaymentAccount ? 'is-active' : 'is-hidden'
            }`}
          >
            <div className="admin-visibility-card__info">
              <div className="admin-visibility-card__title-row">
                <h3 className="admin-visibility-card__title">
                  {form.showAdminPaymentAccount ? (
                    <Eye size={20} className="text-emerald-400" />
                  ) : (
                    <EyeOff size={20} className="text-rose-400" />
                  )}
                  Admin Official Payment Account Visibility
                </h3>
                {form.showAdminPaymentAccount ? (
                  <span className="admin-visibility-badge admin-visibility-badge--on">
                    <Check size={12} /> Visible on User Side
                  </span>
                ) : (
                  <span className="admin-visibility-badge admin-visibility-badge--off">
                    <EyeOff size={12} /> Hidden from User Side
                  </span>
                )}
              </div>
              <p className="admin-settings-field-hint">
                When turned <strong>ON</strong>, users see the &quot;Admin Official Payment Account&quot; (Bank details, UPI ID, and QR code) on their deposit screens. When turned <strong>OFF</strong>, this entire payment account block is hidden from users.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-text-muted hidden sm:inline">
                {form.showAdminPaymentAccount ? 'Status: Active (Showing)' : 'Status: Inactive (Hidden)'}
              </span>
              <label className="admin-switch" title="Toggle visibility of Admin Official Payment Account">
                <input
                  type="checkbox"
                  checked={form.showAdminPaymentAccount}
                  onChange={(e) => handleToggleVisibility(e.target.checked)}
                  disabled={toggleBusy || saving}
                />
                <span className="admin-switch-slider"></span>
              </label>
            </div>
          </div>
          {/* Left: Bank Information Form */}
          <div className="admin-settings-card">
            <div className="admin-settings-card__header">
              <h2 className="admin-settings-card__title">
                <Building2 size={20} className="text-accent" />
                Platform Bank Account (INR)
              </h2>
              <span className="admin-settings-card__badge">User Deposit Info</span>
            </div>

            <p className="admin-settings-field-hint">
              Users transfer fiat funds to this account when making INR bank deposits. Make sure all details are accurate.
            </p>

            <form onSubmit={handleSave} className="admin-settings-form">
              <div className="admin-settings-field">
                <label>
                  Bank Name
                  {form.bankName && <span className="text-xs text-accent">Configured</span>}
                </label>
                <input
                  type="text"
                  placeholder="e.g. State Bank of India, HDFC Bank"
                  list="popular-banks"
                  value={form.bankName}
                  onChange={(e) => handleChange('bankName', e.target.value)}
                  required
                />
                <datalist id="popular-banks">
                  {POPULAR_BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              <div className="admin-settings-fields-2">
                <div className="admin-settings-field">
                  <label>
                    Account Number
                    {form.bankAccountNumber && (
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline flex items-center gap-1"
                        onClick={() => copyText(form.bankAccountNumber, 'acc')}
                      >
                        {copiedKey === 'acc' ? <Check size={12} /> : <Copy size={12} />} Copy
                      </button>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 50200012345678"
                    value={form.bankAccountNumber}
                    onChange={(e) => handleChange('bankAccountNumber', e.target.value)}
                    required
                  />
                </div>

                <div className="admin-settings-field">
                  <label>
                    IFSC Code
                    {form.bankIfsc && (
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline flex items-center gap-1"
                        onClick={() => copyText(form.bankIfsc, 'ifsc')}
                      >
                        {copiedKey === 'ifsc' ? <Check size={12} /> : <Copy size={12} />} Copy
                      </button>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SBIN0001234 / HDFC0001234"
                    value={form.bankIfsc}
                    onChange={(e) => handleChange('bankIfsc', e.target.value.toUpperCase())}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    required
                  />
                </div>
              </div>

              <div className="admin-settings-fields-2">
                <div className="admin-settings-field">
                  <label>Account Holder / Beneficiary Name</label>
                  <input
                    type="text"
                    placeholder="e.g. SAFEXCHANGE TECHNOLOGIES PVT LTD"
                    value={form.bankAccountHolder}
                    onChange={(e) => handleChange('bankAccountHolder', e.target.value)}
                    required
                  />
                </div>

                <div className="admin-settings-field">
                  <label>Branch / City (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Connaught Place, New Delhi"
                    value={form.bankBranch}
                    onChange={(e) => handleChange('bankBranch', e.target.value)}
                  />
                </div>
              </div>

              <div className="admin-settings-field">
                <label>
                  <span>UPI ID / VPA (Optional)</span>
                  {form.bankUpiId && (
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline flex items-center gap-1"
                      onClick={() => copyText(form.bankUpiId, 'upi')}
                    >
                      {copiedKey === 'upi' ? <Check size={12} /> : <Copy size={12} />} Copy
                    </button>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="e.g. safex@icici or business@okhdfcbank"
                  value={form.bankUpiId}
                  onChange={(e) => handleChange('bankUpiId', e.target.value)}
                />
                <span className="admin-settings-field-hint">
                  Allows users to pay directly to your VPA using Google Pay, PhonePe, Paytm, BHIM, or any UPI app.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary w-full flex items-center justify-center gap-2"
                  disabled={saving}
                >
                  {saving ? <Loader2 size={16} className="admin-spin" /> : <Save size={16} />}
                  Save Bank Details
                </button>
              </div>
            </form>
          </div>

          {/* Right: QR Scan Code Upload & Live Preview */}
          <div className="flex flex-col gap-4">
            <div className="admin-settings-card">
              <div className="admin-settings-card__header">
                <h2 className="admin-settings-card__title">
                  <QrCode size={20} className="text-accent" />
                  QR Scan Code Upload
                </h2>
                {form.bankQrCode ? (
                  <span className="admin-settings-card__badge admin-settings-card__badge--ok">QR Uploaded</span>
                ) : form.bankUpiId ? (
                  <span className="admin-settings-card__badge">Dynamic UPI QR</span>
                ) : (
                  <span className="admin-settings-card__badge">Not Set</span>
                )}
              </div>

              <p className="admin-settings-field-hint">
                Upload your official UPI QR Scanner image (PhonePe, BharatPe, Google Pay, or Bank QR). Users can scan it directly from their deposit page to pay instantly.
              </p>

              {/* Upload Dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                className="hidden"
                id="admin-qr-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              <div
                className={`admin-qr-dropzone${isDragging ? ' is-dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="admin-qr-dropzone__icon">
                  {qrUploading ? (
                    <Loader2 size={24} className="admin-spin" />
                  ) : (
                    <UploadCloud size={24} />
                  )}
                </div>
                <div className="admin-qr-dropzone__text">
                  <strong>{qrUploading ? 'Uploading QR Code…' : 'Click to Upload or Drag & Drop'}</strong>
                  <span>Supports PNG, JPG, WebP, SVG (Max 5MB)</span>
                </div>
              </div>

              {/* QR Image Preview */}
              {form.bankQrCode ? (
                <div className="admin-qr-preview-box">
                  <div className="admin-qr-image-wrapper">
                    <img
                      src={resolvedQrUrl}
                      alt="Uploaded Bank QR Code"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-text-primary font-medium mb-1">
                      Official Uploaded QR Scanner
                    </p>
                    <code className="text-[11px] text-text-muted break-all">
                      {form.bankQrCode}
                    </code>
                  </div>
                  <div className="admin-qr-preview-actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm flex items-center gap-1.5"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={qrUploading}
                    >
                      <ImageIcon size={14} /> Replace QR
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger admin-btn--sm flex items-center gap-1.5"
                      onClick={handleRemoveQr}
                      disabled={qrUploading}
                    >
                      <Trash2 size={14} /> Remove QR
                    </button>
                  </div>
                </div>
              ) : form.bankUpiId ? (
                <div className="admin-qr-preview-box">
                  <div className="admin-qr-image-wrapper">
                    <QRCodeSVG
                      value={upiIntentUri || form.bankUpiId}
                      size={170}
                      level="M"
                      includeMargin
                    />
                  </div>
                  <div className="text-center">
                    <span className="admin-settings-card__badge admin-settings-card__badge--ok mb-1">
                      Auto Generated from UPI ID
                    </span>
                    <p className="text-xs text-text-muted mt-1">
                      Users can scan with GPay / PhonePe / Paytm to pay {form.bankUpiId}.
                      You can also upload an official merchant QR image above!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-bg-tertiary rounded-xl text-center text-xs text-text-muted">
                  No QR code uploaded and no UPI ID configured yet. Upload a QR scanner or enter a UPI ID to show user scan options.
                </div>
              )}
            </div>

            {/* Live User Screen Mockup */}
            <div className={`admin-user-preview-mockup ${!form.showAdminPaymentAccount ? 'is-hidden-preview' : ''}`}>
              <div className="admin-user-preview-mockup__head">
                <span className="flex items-center gap-1.5">
                  <Smartphone size={14} /> Live User Deposit Preview
                </span>
                {form.showAdminPaymentAccount ? (
                  <span className="admin-user-preview-pill">
                    <FileCheck size={12} /> Visible to Users
                  </span>
                ) : (
                  <span className="admin-user-preview-pill admin-user-preview-pill--hidden">
                    <EyeOff size={12} /> Hidden from Users
                  </span>
                )}
              </div>

              {!form.showAdminPaymentAccount && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                  <EyeOff size={16} className="shrink-0" />
                  <span>
                    <strong>Admin Official Payment Account</strong> is currently hidden on the user side. Users will not see this bank and QR payment box.
                  </span>
                </div>
              )}

              <div className={`admin-user-preview-card ${!form.showAdminPaymentAccount ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-accent" />
                    <div>
                      <p className="text-xs font-bold text-text-primary">
                        {form.bankName || 'Bank Name'}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {form.bankAccountHolder || 'Beneficiary Name'}
                      </p>
                    </div>
                  </div>
                  {form.bankQrCode && (
                    <span className="text-[10px] bg-accent/15 text-accent font-semibold px-2 py-0.5 rounded">
                      QR Ready
                    </span>
                  )}
                </div>

                <div className="admin-user-preview-row">
                  <span className="admin-user-preview-row__label">Account:</span>
                  <span className="admin-user-preview-row__value">
                    {form.bankAccountNumber || '—'}
                  </span>
                </div>
                <div className="admin-user-preview-row">
                  <span className="admin-user-preview-row__label">IFSC:</span>
                  <span className="admin-user-preview-row__value">{form.bankIfsc || '—'}</span>
                </div>
                {form.bankBranch && (
                  <div className="admin-user-preview-row">
                    <span className="admin-user-preview-row__label">Branch:</span>
                    <span className="admin-user-preview-row__value">{form.bankBranch}</span>
                  </div>
                )}
                {form.bankUpiId && (
                  <div className="admin-user-preview-row">
                    <span className="admin-user-preview-row__label">UPI ID:</span>
                    <span className="admin-user-preview-row__value text-accent">
                      {form.bankUpiId}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Rates & Referral Economics */}
      {activeTab === 'rates' && (
        <div className="admin-settings-card">
          <div className="admin-settings-card__header">
            <h2 className="admin-settings-card__title">
              <DollarSign size={20} className="text-accent" />
              Currency Rates &amp; Referral Program
            </h2>
            <span className="admin-settings-card__badge">Live Exchange Economy</span>
          </div>

          <form onSubmit={handleSave} className="admin-settings-form">
            <div className="admin-settings-fields-2">
              <div className="admin-settings-field">
                <label>
                  <span>USDT Price in INR (1 USDT = ? INR)</span>
                  <span className="text-xs text-accent">Default: 83.5</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="0.01"
                  value={form.usdtInrRate}
                  onChange={(e) => handleChange('usdtInrRate', e.target.value)}
                  placeholder="83.50"
                  required
                />
                <span className="admin-settings-field-hint">
                  All user wallet balances, asset totals, trading headers, and markets convert to INR using this official rate.
                </span>
              </div>

              <div className="admin-settings-field">
                <label>
                  <span>Referral Reward (USDT per signup)</span>
                  <span className="text-xs text-accent">0 to disable</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.referralRewardUsdt}
                  onChange={(e) => handleChange('referralRewardUsdt', e.target.value)}
                  placeholder="e.g. 10"
                />
                <span className="admin-settings-field-hint">
                  Credited to the referrer wallet automatically when a new user signs up with their invitation code.
                </span>
              </div>
            </div>

            <div className="admin-settings-fields-2">
              <div className="admin-settings-field">
                <label>Cash in Person Deposit Rate (INR per 1 USDT)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cashInPersonDepositRate}
                  onChange={(e) => handleChange('cashInPersonDepositRate', e.target.value)}
                  placeholder="e.g. 100"
                />
                <span className="admin-settings-field-hint">
                  Rate applied when clients deposit physical cash with verified agents.
                </span>
              </div>

              <div className="admin-settings-field">
                <label>Cash in Person Withdraw Rate (INR per 1 USDT)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cashInPersonWithdrawRate}
                  onChange={(e) => handleChange('cashInPersonWithdrawRate', e.target.value)}
                  placeholder="e.g. 98"
                />
                <span className="admin-settings-field-hint">
                  Rate applied when clients cash out physical cash via verified agents.
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="admin-btn admin-btn--primary flex items-center gap-2"
                disabled={saving}
              >
                {saving ? <Loader2 size={16} className="admin-spin" /> : <Save size={16} />}
                Save Rates &amp; Rewards
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Crypto Wallets & Hot Keys */}
      {activeTab === 'crypto' && (
        <div className="admin-settings-card">
          <div className="admin-settings-card__header">
            <h2 className="admin-settings-card__title">
              <Wallet size={20} className="text-accent" />
              Platform Crypto Wallets &amp; Master Secret
            </h2>
            <span className="admin-settings-card__badge">On-Chain Deposit Routing</span>
          </div>

          <form onSubmit={handleSave} className="admin-settings-form">
            <div className="admin-settings-fields-2">
              <div className="admin-settings-field">
                <label>
                  <span>BNB Smart Chain (BEP20) Address</span>
                  {form.bnbWalletAddress?.startsWith('0x') && (
                    <span className="text-xs text-accent">Configured</span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="0x…"
                  value={form.bnbWalletAddress}
                  onChange={(e) => handleChange('bnbWalletAddress', e.target.value)}
                />
              </div>

              <div className="admin-settings-field">
                <label>
                  <span>Ethereum (ERC20) Address</span>
                  {form.ethWalletAddress?.startsWith('0x') && (
                    <span className="text-xs text-accent">Configured</span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="0x…"
                  value={form.ethWalletAddress}
                  onChange={(e) => handleChange('ethWalletAddress', e.target.value)}
                />
              </div>
            </div>

            <div className="admin-settings-fields-2">
              <div className="admin-settings-field">
                <label>
                  <span>TRON (TRC20) Address</span>
                  {form.trcWalletAddress?.startsWith('T') && (
                    <span className="text-xs text-accent">Configured</span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="T… (TRON address — not 0x)"
                  value={form.trcWalletAddress}
                  onChange={(e) => handleChange('trcWalletAddress', e.target.value)}
                />
              </div>

              <div className="admin-settings-field">
                <label>
                  <span>USDT Primary Deposit Address (Optional fallback)</span>
                  {form.usdtWalletAddress && <span className="text-xs text-accent">Configured</span>}
                </label>
                <input
                  type="text"
                  placeholder="Custom USDT deposit destination"
                  value={form.usdtWalletAddress}
                  onChange={(e) => handleChange('usdtWalletAddress', e.target.value)}
                />
              </div>
            </div>

            <div className="admin-settings-field">
              <label>
                <span className="flex items-center gap-1.5">
                  <Shield size={14} className="text-accent" />
                  EVM Master Mnemonic / Derivation Secret
                </span>
                {meta.hasEvmMnemonic && (
                  <span className="text-xs text-accent">Secret Saved in DB</span>
                )}
              </label>
              <div className="admin-secret-wrap">
                <input
                  type={showSecrets.evmMnemonic ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={meta.hasEvmMnemonic ? '•••••••••••••••• (Leave blank to keep existing)' : '12-word BIP-39 phrase'}
                  value={form.evmMnemonic}
                  onChange={(e) => handleChange('evmMnemonic', e.target.value)}
                />
                <button
                  type="button"
                  className="admin-secret-toggle"
                  onClick={() =>
                    setShowSecrets((s) => ({ ...s, evmMnemonic: !s.evmMnemonic }))
                  }
                >
                  {showSecrets.evmMnemonic ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="admin-settings-field-hint">
                Each registered user gets an isolated deterministic deposit address derived from this master secret.
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="admin-btn admin-btn--primary flex items-center gap-2"
                disabled={saving}
              >
                {saving ? <Loader2 size={16} className="admin-spin" /> : <Save size={16} />}
                Save Crypto Wallets
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
