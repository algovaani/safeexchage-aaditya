import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Building2,
  Check,
  Copy,
  CreditCard,
  FileCheck,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
  UploadCloud,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cashInPersonAPI, depositAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { resolveAssetUrl } from '../utils/assetUrl.js';
import { fmtINR } from '../utils/format.js';
import './DepositModal.css';

const SAVED_BANK_KEY = 'safex_user_bank';

function getSavedLocalBank() {
  try {
    const raw = localStorage.getItem(SAVED_BANK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function CashInPersonModal({ user, userMobile, platformInfo, onClose, onSuccess }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const localBank = useMemo(() => getSavedLocalBank(), []);

  const [form, setForm] = useState({
    type: 'deposit',
    mobile: user?.mobile || userMobile || '',
    city: '',
    amount: '',
    utrNumber: '',
    // User's bank details for withdraw (pre-filled from user profile or saved local)
    bankName: user?.bankName || localBank?.bankName || '',
    accountNumber: user?.accountNumber || localBank?.accountNumber || '',
    ifsc: user?.ifsc || localBank?.ifsc || '',
    accountHolder: user?.accountHolder || localBank?.accountHolder || user?.name || '',
  });

  const [proof, setProof] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [adminBank, setAdminBank] = useState(platformInfo?.bank || null);

  useEffect(() => {
    if (user?.mobile || userMobile) {
      setForm((f) => ({ ...f, mobile: user?.mobile || userMobile }));
    }
  }, [user, userMobile]);

  // Load platform bank details if not supplied
  useEffect(() => {
    if (!adminBank) {
      depositAPI
        .getPlatformInfo()
        .then((info) => {
          if (info?.bank) setAdminBank(info.bank);
        })
        .catch(() => {});
    }
  }, [adminBank]);

  // Close on Escape & prevent body scroll
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const isWithdraw = form.type === 'withdraw';
  const amount = Number(form.amount);
  const rate = Number(
    isWithdraw ? platformInfo?.cashInPerson?.withdrawRate : platformInfo?.cashInPerson?.depositRate
  );
  const hasRate = Number.isFinite(rate) && rate > 0;
  const inrValue = Number.isFinite(amount) && amount > 0 && hasRate ? amount * rate : 0;
  const rateLabel = useMemo(() => (isWithdraw ? 'Withdraw rate' : 'Deposit rate'), [isWithdraw]);

  async function copyToClipboard(text, fieldKey) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Could not copy');
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProof(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setProofPreview(url);
    } else {
      setProofPreview(null);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const mobile = form.mobile.trim();
    const city = form.city.trim();

    if (!mobile || !city) {
      const message = 'Mobile number and city are required.';
      setErr(message);
      toast.warning(message);
      return;
    }

    if (isWithdraw) {
      if (!(amount > 0)) {
        const message = 'Enter the amount you want to withdraw.';
        setErr(message);
        toast.warning(message);
        return;
      }
      if (!form.accountNumber.trim() || !form.ifsc.trim() || !form.accountHolder.trim()) {
        const message = 'Please enter your bank account number, IFSC code, and account holder name.';
        setErr(message);
        toast.warning(message);
        return;
      }
    } else {
      // Deposit validation
      if (!form.utrNumber.trim()) {
        const message = 'UTR / Reference Number is required for deposit.';
        setErr(message);
        toast.warning(message);
        return;
      }
      if (!proof) {
        const message = 'Please upload your payment screenshot or receipt.';
        setErr(message);
        toast.warning(message);
        return;
      }
    }

    setBusy(true);
    try {
      if (isWithdraw) {
        const body = {
          type: 'withdraw',
          mobile,
          city,
          amount,
          bankName: form.bankName.trim(),
          accountNumber: form.accountNumber.trim(),
          ifsc: form.ifsc.trim().toUpperCase(),
          accountHolder: form.accountHolder.trim(),
        };

        // Save bank details to localStorage for client persistence
        localStorage.setItem(
          SAVED_BANK_KEY,
          JSON.stringify({
            bankName: form.bankName.trim(),
            accountNumber: form.accountNumber.trim(),
            ifsc: form.ifsc.trim().toUpperCase(),
            accountHolder: form.accountHolder.trim(),
          })
        );

        await cashInPersonAPI.submit(body);
      } else {
        // Deposit with multipart FormData
        const fd = new FormData();
        fd.append('type', 'deposit');
        fd.append('mobile', mobile);
        fd.append('city', city);
        if (Number.isFinite(amount) && amount > 0) {
          fd.append('amount', String(amount));
        }
        fd.append('utrNumber', form.utrNumber.trim());
        if (proof) {
          fd.append('payment_proof', proof);
        }

        await cashInPersonAPI.submit(fd);
      }

      setDone(true);
      toast.success(
        isWithdraw
          ? 'Withdraw request sent — our team will process your payout.'
          : 'Deposit request sent — admin will verify your screenshot and credit your wallet.'
      );
      onSuccess?.();
      setTimeout(onClose, 2000);
    } catch (ex) {
      setErr(ex.message || 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  const resolvedAdminQr = adminBank?.qrCode ? resolveAssetUrl(adminBank.qrCode) : '';
  const upiIntentUri = adminBank?.upiId
    ? `upi://pay?pa=${encodeURIComponent(adminBank.upiId)}&pn=${encodeURIComponent(
        adminBank.holder || 'SafeXchange'
      )}&cu=INR`
    : '';

  return (
    <div className="deposit-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="deposit-modal cash-in-person-modal cash-in-person-modal--enhanced"
        role="dialog"
        aria-labelledby="cash-in-person-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="deposit-modal__header">
          <div className="deposit-modal__title-wrap">
            <span className="deposit-modal__coin-icon cash-in-person-modal__icon">
              <Banknote size={18} color="#0b162c" strokeWidth={2.25} />
            </span>
            <div>
              <h2 id="cash-in-person-title">Cash in Person (INR)</h2>
              <p className="deposit-modal__subtitle">Direct Bank &amp; Cash transfers</p>
            </div>
          </div>
          <button type="button" className="deposit-modal__close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="deposit-modal__body">
          {done ? (
            <div className="cash-in-person-modal__success-box">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <FileCheck size={26} />
              </div>
              <p className="deposit-modal__success font-bold text-base">Request Submitted Successfully</p>
              <p className="cash-in-person-modal__success-sub">
                {isWithdraw
                  ? 'Your withdraw request and bank details have been saved. Admin will process the payout to your bank account.'
                  : 'Your deposit proof and UTR have been sent to admin for approval. Funds will be credited to your wallet shortly.'}
              </p>
            </div>
          ) : (
            <form className="deposit-modal__form space-y-4" onSubmit={submit}>
              {/* Type Switcher */}
              <div className="deposit-modal__field">
                <label>Request type</label>
                <div className="cash-in-person-modal__type-tabs" role="group" aria-label="Request type">
                  <button
                    type="button"
                    className={form.type === 'deposit' ? 'is-active' : ''}
                    onClick={() => {
                      setForm((f) => ({ ...f, type: 'deposit' }));
                      setErr('');
                    }}
                  >
                    Deposit
                  </button>
                  <button
                    type="button"
                    className={form.type === 'withdraw' ? 'is-active' : ''}
                    onClick={() => {
                      setForm((f) => ({ ...f, type: 'withdraw' }));
                      setErr('');
                    }}
                  >
                    Withdraw
                  </button>
                </div>
              </div>

              {/* Rate Box */}
              <div className="cash-in-person-modal__rate-box">
                <div className="flex items-center justify-between">
                  <span>
                    <strong>{rateLabel}:</strong> {hasRate ? `${fmtINR(rate)} ` : 'Loading…'}
                  </span>
                  {hasRate && (
                    <span className="text-xs text-amber-300">
                      1 USDT = {fmtINR(rate)}
                    </span>
                  )}
                </div>
                {hasRate && Number.isFinite(amount) && amount > 0 && (
                  <div className="cash-in-person-modal__calc text-amber-400 font-bold mt-1">
                    {amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT ={' '}
                    <span>{fmtINR(inrValue)}</span>
                  </div>
                )}
              </div>

              {/* =================== DEPOSIT FLOW =================== */}
              {!isWithdraw && (
                <>
                  {/* Admin Bank Details & QR Display */}
                  <div className="cip-admin-bank-box rounded-xl p-3.5 bg-slate-900/80 border border-amber-500/30 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-amber-400" />
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                          Admin Official Payment Account
                        </span>
                      </div>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-semibold">
                        Pay Here
                      </span>
                    </div>

                    {/* Official QR Code */}
                    {(adminBank?.qrCode || adminBank?.upiId) && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                        <div className="p-2 bg-white rounded-lg shadow-sm shrink-0 flex items-center justify-center">
                          {resolvedAdminQr ? (
                            <img
                              src={resolvedAdminQr}
                              alt="Official QR Code"
                              className="w-28 h-28 object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <QRCodeSVG
                              value={upiIntentUri || adminBank?.upiId || ''}
                              size={112}
                              level="M"
                              includeMargin
                            />
                          )}
                        </div>
                        <div className="text-left space-y-1">
                          <p className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Smartphone size={14} className="text-amber-400" />
                            Scan with Any UPI App
                          </p>
                          <p className="text-[11px] text-slate-400 leading-tight">
                            Google Pay, PhonePe, Paytm, BHIM &amp; UPI
                          </p>
                          {adminBank?.upiId && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <span className="text-[11px] text-slate-400">UPI ID:</span>
                              <code className="text-xs text-amber-400 font-mono font-bold">
                                {adminBank.upiId}
                              </code>
                              <button
                                type="button"
                                className="text-amber-400 hover:text-amber-300 ml-1"
                                onClick={() => copyToClipboard(adminBank.upiId, 'admin_upi')}
                                title="Copy UPI ID"
                              >
                                {copiedField === 'admin_upi' ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Admin Bank Fields */}
                    <div className="text-xs space-y-1.5 pt-1">
                      <div className="flex items-center justify-between py-0.5">
                        <span className="text-slate-400">Bank Name:</span>
                        <span className="font-semibold text-white">
                          {adminBank?.name || 'SafeXchange Bank'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-0.5 border-t border-slate-800/80 pt-1">
                        <span className="text-slate-400">Account Number:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-white">
                            {adminBank?.account || '—'}
                          </span>
                          {adminBank?.account && (
                            <button
                              type="button"
                              className="text-amber-400 hover:text-amber-300 p-0.5"
                              onClick={() => copyToClipboard(adminBank.account, 'admin_acc')}
                              title="Copy Account Number"
                            >
                              {copiedField === 'admin_acc' ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-0.5 border-t border-slate-800/80 pt-1">
                        <span className="text-slate-400">IFSC Code:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-white">
                            {adminBank?.ifsc || '—'}
                          </span>
                          {adminBank?.ifsc && (
                            <button
                              type="button"
                              className="text-amber-400 hover:text-amber-300 p-0.5"
                              onClick={() => copyToClipboard(adminBank.ifsc, 'admin_ifsc')}
                              title="Copy IFSC Code"
                            >
                              {copiedField === 'admin_ifsc' ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-0.5 border-t border-slate-800/80 pt-1">
                        <span className="text-slate-400">Account Holder:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white">
                            {adminBank?.holder || 'SafeXchange'}
                          </span>
                          {adminBank?.holder && (
                            <button
                              type="button"
                              className="text-amber-400 hover:text-amber-300 p-0.5"
                              onClick={() => copyToClipboard(adminBank.holder, 'admin_holder')}
                              title="Copy Holder Name"
                            >
                              {copiedField === 'admin_holder' ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {adminBank?.branch && (
                        <div className="flex items-center justify-between py-0.5 border-t border-slate-800/80 pt-1">
                          <span className="text-slate-400">Branch:</span>
                          <span className="text-slate-200">{adminBank.branch}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* UTR / Transaction Reference Input */}
                  <div className="deposit-modal__field">
                    <label htmlFor="cip-utr" className="flex items-center justify-between">
                      <span>UTR / Reference Number *</span>
                      <span className="text-[11px] text-amber-400">Required</span>
                    </label>
                    <input
                      id="cip-utr"
                      className="deposit-modal__input"
                      type="text"
                      value={form.utrNumber}
                      onChange={(e) => setForm((f) => ({ ...f, utrNumber: e.target.value }))}
                      placeholder="e.g. 12-digit UTR from GPay / PhonePe / Bank receipt"
                      required
                    />
                  </div>

                  {/* Screenshot / Payment Proof Upload */}
                  <div className="deposit-modal__field">
                    <label className="flex items-center justify-between">
                      <span>Upload Payment Screenshot *</span>
                      <span className="text-[11px] text-amber-400">Receipt / Proof</span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      id="cip-proof-input"
                      onChange={handleFileChange}
                    />

                    <div
                      className="p-3 border-2 border-dashed border-slate-700 hover:border-amber-400 rounded-xl bg-slate-900/60 cursor-pointer text-center transition flex flex-col items-center justify-center gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {proofPreview ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={proofPreview}
                            alt="Proof Preview"
                            className="w-16 h-16 object-cover rounded-lg border border-amber-400/40"
                          />
                          <div className="text-left text-xs">
                            <p className="font-semibold text-white truncate max-w-[200px]">
                              {proof?.name}
                            </p>
                            <p className="text-slate-400 text-[11px]">
                              {(proof.size / 1024).toFixed(1)} KB — Click to change
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center">
                            <UploadCloud size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">
                              {proof ? proof.name : 'Click to upload payment screenshot'}
                            </p>
                            <span className="text-[11px] text-slate-400">
                              JPG, PNG, WebP or PDF (Max 10MB)
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* =================== WITHDRAW FLOW =================== */}
              {isWithdraw && (
                <div className="cip-user-bank-form space-y-3 p-3.5 bg-slate-900/80 border border-slate-700/80 rounded-xl">
                  <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                    <div className="flex items-center gap-2">
                      <CreditCard size={16} className="text-amber-400" />
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                        Your Bank Details (For Payout)
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                      <ShieldCheck size={11} /> Auto Saved
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Admin will transfer cash/INR to this bank account upon request approval.
                  </p>

                  <div className="deposit-modal__field">
                    <label htmlFor="user-bank-name">Bank Name *</label>
                    <input
                      id="user-bank-name"
                      className="deposit-modal__input"
                      type="text"
                      placeholder="e.g. State Bank of India, HDFC Bank"
                      value={form.bankName}
                      onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="deposit-modal__field">
                      <label htmlFor="user-bank-acc">Account Number *</label>
                      <input
                        id="user-bank-acc"
                        className="deposit-modal__input font-mono"
                        type="text"
                        placeholder="e.g. 50200012345678"
                        value={form.accountNumber}
                        onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="deposit-modal__field">
                      <label htmlFor="user-bank-ifsc">IFSC Code *</label>
                      <input
                        id="user-bank-ifsc"
                        className="deposit-modal__input font-mono uppercase"
                        type="text"
                        placeholder="e.g. SBIN0001234"
                        value={form.ifsc}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="deposit-modal__field">
                    <label htmlFor="user-bank-holder">Account Holder Name *</label>
                    <input
                      id="user-bank-holder"
                      className="deposit-modal__input"
                      type="text"
                      placeholder="Name as per bank passbook"
                      value={form.accountHolder}
                      onChange={(e) => setForm((f) => ({ ...f, accountHolder: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Shared Fields: Mobile, City, Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="deposit-modal__field">
                  <label htmlFor="cip-mobile">Mobile number *</label>
                  <input
                    id="cip-mobile"
                    className="deposit-modal__input"
                    type="tel"
                    value={form.mobile}
                    onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                    placeholder="10-digit mobile"
                    required
                  />
                </div>

                <div className="deposit-modal__field">
                  <label htmlFor="cip-city">City *</label>
                  <input
                    id="cip-city"
                    className="deposit-modal__input"
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Your city"
                    required
                  />
                </div>
              </div>

              <div className="deposit-modal__field">
                <label htmlFor="cip-amount">
                  {isWithdraw ? 'Withdraw Amount (USDT) *' : 'Deposit Amount (USDT) — Optional'}
                </label>
                <input
                  id="cip-amount"
                  className="deposit-modal__input font-mono"
                  type="number"
                  step="any"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder={isWithdraw ? 'Amount in USDT to withdraw' : 'Expected USDT amount'}
                  required={isWithdraw}
                />
                {hasRate && Number.isFinite(amount) && amount > 0 && (
                  <p className="cash-in-person-modal__amount-hint text-amber-300">
                    Estimated INR value: <strong>{fmtINR(inrValue)}</strong>
                  </p>
                )}
              </div>

              {err && <p className="deposit-modal__error">{err}</p>}

              <div className="deposit-modal__footer pt-2">
                <button
                  type="button"
                  className="deposit-modal__footer-cancel"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="deposit-modal__submit" disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 size={16} className="deposit-modal__spin" /> Submitting…
                    </>
                  ) : isWithdraw ? (
                    'Send withdraw request'
                  ) : (
                    'Send deposit request'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
