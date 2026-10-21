import { useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  Smartphone,
  X,
} from 'lucide-react';
import StatusBadge from '../ui/StatusBadge.jsx';
import { resolveAssetUrl } from '../../utils/assetUrl.js';
import '../DialogModal.css';

export default function CashInPersonDetailModal({
  row,
  onClose,
  onApprove,
  onReject,
  busy = false,
}) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [settleAmount, setSettleAmount] = useState(
    row?.requestedAmount != null ? String(row.requestedAmount) : ''
  );
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  if (!row) return null;

  const isWithdraw = row.type === 'withdraw';
  const u = row.user || {};
  const userLabel = u.name || u.mobile || u.email || row.mobile || 'User';
  const proofUrl = row.paymentProof ? resolveAssetUrl(row.paymentProof) : '';

  async function copyText(text, key) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      /* ignore */
    }
  }

  function handleApproveSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const num = parseFloat(settleAmount);
    if (!(num > 0)) return;
    onApprove(row, num);
  }

  function handleRejectSubmit(e) {
    e.preventDefault();
    if (busy) return;
    onReject(row, rejectNote);
  }

  return (
    <div
      className="dialog-modal-backdrop"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        className="dialog-modal dialog-modal--deposit-approve"
        style={{ maxWidth: '640px' }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-modal__header">
          <div className="flex items-center gap-2">
            <h2 className="dialog-modal__title">
              Cash in Person — {isWithdraw ? 'Withdrawal Payout' : 'Deposit Approval'}
            </h2>
            <StatusBadge status={row.status} />
          </div>
          <button
            type="button"
            className="dialog-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="dialog-modal__body space-y-4 text-xs">
          {/* User info strip */}
          <div className="p-3 bg-bg-tertiary rounded-xl border border-border grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <span className="text-text-muted block text-[11px]">User</span>
              <span className="font-semibold text-text-primary truncate block">{userLabel}</span>
            </div>
            <div>
              <span className="text-text-muted block text-[11px]">Contact Mobile</span>
              <span className="font-semibold text-text-primary">{row.mobile || '—'}</span>
            </div>
            <div>
              <span className="text-text-muted block text-[11px]">City / Location</span>
              <span className="font-semibold text-text-primary">{row.city || '—'}</span>
            </div>
            <div>
              <span className="text-text-muted block text-[11px]">Requested Amount</span>
              <span className="font-bold text-accent">
                {row.requestedAmount != null ? `${row.requestedAmount} USDT` : '—'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block text-[11px]">Submitted Date</span>
              <span className="text-text-secondary">
                {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
              </span>
            </div>
            {row.creditedAmount != null && (
              <div>
                <span className="text-text-muted block text-[11px]">Settled Amount</span>
                <span className="font-bold text-emerald-400">{row.creditedAmount} USDT</span>
              </div>
            )}
          </div>

          {/* DEPOSIT DETAILS: UTR & PAYMENT SCREENSHOT */}
          {!isWithdraw && (
            <div className="p-3.5 bg-bg-tertiary rounded-xl border border-border space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-text-primary flex items-center gap-1.5">
                  <FileText size={15} className="text-accent" />
                  Deposit Payment Verification
                </span>
                <span className="text-[10px] text-accent bg-accent/15 px-2 py-0.5 rounded font-semibold">
                  INR Deposit
                </span>
              </div>

              {/* UTR NUMBER BOX */}
              <div className="p-2.5 bg-bg-secondary rounded-lg border border-border flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-text-muted block">Transaction UTR / Reference</span>
                  <span className="font-mono font-bold text-sm text-accent select-all">
                    {row.utrNumber || 'No UTR provided'}
                  </span>
                </div>
                {row.utrNumber && (
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm flex items-center gap-1"
                    onClick={() => copyText(row.utrNumber, 'utr')}
                  >
                    {copiedKey === 'utr' ? <Check size={13} /> : <Copy size={13} />}
                    {copiedKey === 'utr' ? 'Copied' : 'Copy UTR'}
                  </button>
                )}
              </div>

              {/* PAYMENT SCREENSHOT */}
              <div>
                <span className="text-[11px] text-text-muted block mb-1.5 font-medium">
                  Payment Proof Screenshot
                </span>
                {proofUrl ? (
                  <div className="space-y-2">
                    <div
                      className="relative rounded-lg overflow-hidden border border-border bg-black/40 flex items-center justify-center max-h-64 cursor-pointer group"
                      onClick={() => setShowFullImage(true)}
                    >
                      <img
                        src={proofUrl}
                        alt="Deposit Receipt"
                        className="max-h-60 object-contain w-auto mx-auto"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 text-white font-medium">
                        <Eye size={18} /> Click to View Full Resolution
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-text-muted truncate max-w-[300px]">
                        {row.paymentProof}
                      </span>
                      <a
                        href={proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-link text-xs flex items-center gap-1"
                      >
                        <ExternalLink size={12} /> Open in new tab
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-bg-secondary rounded-lg text-center text-text-muted">
                    No screenshot uploaded for this request.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WITHDRAW DETAILS: USER BANK ACCOUNT */}
          {isWithdraw && (
            <div className="p-3.5 bg-bg-tertiary rounded-xl border border-border space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-text-primary flex items-center gap-1.5">
                  <Building2 size={15} className="text-accent" />
                  User Bank Account (Send Payout Here)
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded font-semibold">
                  Payout Destination
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-bg-secondary rounded-lg border border-border">
                  <span className="text-text-muted block text-[11px]">Bank Name</span>
                  <span className="font-semibold text-text-primary">
                    {row.bankName || '—'}
                  </span>
                </div>

                <div className="p-2.5 bg-bg-secondary rounded-lg border border-border flex items-center justify-between">
                  <div>
                    <span className="text-text-muted block text-[11px]">Account Number</span>
                    <span className="font-mono font-bold text-text-primary select-all">
                      {row.accountNumber || '—'}
                    </span>
                  </div>
                  {row.accountNumber && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm p-1"
                      onClick={() => copyText(row.accountNumber, 'acc')}
                      title="Copy Account Number"
                    >
                      {copiedKey === 'acc' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>

                <div className="p-2.5 bg-bg-secondary rounded-lg border border-border flex items-center justify-between">
                  <div>
                    <span className="text-text-muted block text-[11px]">IFSC Code</span>
                    <span className="font-mono font-bold text-accent select-all uppercase">
                      {row.ifsc || '—'}
                    </span>
                  </div>
                  {row.ifsc && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm p-1"
                      onClick={() => copyText(row.ifsc, 'ifsc')}
                      title="Copy IFSC Code"
                    >
                      {copiedKey === 'ifsc' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>

                <div className="p-2.5 bg-bg-secondary rounded-lg border border-border flex items-center justify-between">
                  <div>
                    <span className="text-text-muted block text-[11px]">Account Holder</span>
                    <span className="font-semibold text-text-primary select-all">
                      {row.accountHolder || u.name || '—'}
                    </span>
                  </div>
                  {(row.accountHolder || u.name) && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm p-1"
                      onClick={() => copyText(row.accountHolder || u.name, 'holder')}
                      title="Copy Account Holder"
                    >
                      {copiedKey === 'holder' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ADMIN ACTION CONTROLS */}
          {row.status === 'pending' && (
            <div className="pt-2 border-t border-border space-y-3">
              {!showRejectForm ? (
                <form onSubmit={handleApproveSubmit} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] text-text-muted font-semibold block mb-1">
                        {isWithdraw ? 'Settled Debit Amount (USDT)' : 'Settled Credit Amount (USDT)'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        className="admin-input w-full font-mono font-bold"
                        value={settleAmount}
                        onChange={(e) => setSettleAmount(e.target.value)}
                        placeholder="Amount in USDT"
                        required
                        disabled={busy}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger admin-btn--sm"
                      onClick={() => setShowRejectForm(true)}
                      disabled={busy}
                    >
                      Reject Request…
                    </button>
                    <button
                      type="submit"
                      className="admin-btn admin-btn--primary admin-btn--sm flex items-center gap-1.5"
                      disabled={busy || !settleAmount || parseFloat(settleAmount) <= 0}
                    >
                      {busy ? (
                        <>
                          <Loader2 size={13} className="admin-spin" /> Processing…
                        </>
                      ) : (
                        <>
                          <FileCheck size={13} />
                          {isWithdraw ? 'Approve & Debit' : 'Approve & Credit'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRejectSubmit} className="space-y-2 bg-loss/10 p-3 rounded-xl border border-loss/20">
                  <label className="text-xs font-semibold text-loss block">
                    Rejection Reason (Optional)
                  </label>
                  <input
                    type="text"
                    className="admin-input w-full"
                    placeholder="e.g. Invalid UTR, payment not received, IFSC mismatch"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    disabled={busy}
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => setShowRejectForm(false)}
                      disabled={busy}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="admin-btn admin-btn--danger admin-btn--sm"
                      disabled={busy}
                    >
                      {busy ? 'Rejecting…' : 'Confirm Rejection'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FULL IMAGE MODAL */}
      {showFullImage && proofUrl && (
        <div
          className="fixed inset-0 z-[1100] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-black rounded-xl overflow-hidden p-2">
            <button
              type="button"
              className="absolute top-4 right-4 bg-black/70 hover:bg-black text-white p-2 rounded-full z-10"
              onClick={() => setShowFullImage(false)}
            >
              <X size={20} />
            </button>
            <img
              src={proofUrl}
              alt="Full Payment Proof"
              className="max-h-[85vh] w-auto mx-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
