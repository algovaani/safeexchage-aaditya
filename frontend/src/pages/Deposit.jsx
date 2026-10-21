import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Check, Copy, Loader2, QrCode, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { depositAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { COIN_COLORS, FIAT_DEPOSIT_SYMBOLS } from '../config/depositNetworks.js';
import { isCryptoDepositSupported } from '../config/cryptoDepositChains.js';
import { WALLET_ASSETS } from '../theme/assets.js';
import { resolveAssetUrl } from '../utils/assetUrl.js';
import CryptoDepositView from '../components/CryptoDepositView.jsx';
import Input from '../components/ui/Input.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { fmtUSD } from '../utils/format.js';
import '../components/DepositModal.css';

const FIAT_ONLY = FIAT_DEPOSIT_SYMBOLS;

export default function Deposit() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const coinParam = (searchParams.get('coin') || 'USDT').toUpperCase();

  const [selectedCoin, setSelectedCoin] = useState(coinParam);
  const [tab, setTab] = useState(FIAT_ONLY.has(coinParam) ? 'fiat' : 'crypto');
  const [platform, setPlatform] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submitLockRef = useRef(false);

  const coinColor = COIN_COLORS[selectedCoin] || '#f0b90b';
  const cryptoSupported = isCryptoDepositSupported(selectedCoin);

  const [fiatForm, setFiatForm] = useState({
    amount: '',
    bank_name: '',
    account_number: '',
    branch: '',
    utr_number: '',
  });
  const [proof, setProof] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  async function copyToClipboard(text, fieldName) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }

  const cryptoCoins = useMemo(
    () => WALLET_ASSETS.map((a) => a.symbol).filter((s) => !FIAT_ONLY.has(s) && isCryptoDepositSupported(s)),
    []
  );

  useEffect(() => {
    setSelectedCoin(coinParam);
    setTab(FIAT_ONLY.has(coinParam) ? 'fiat' : 'crypto');
  }, [coinParam]);

  async function loadData() {
    setLoading(true);
    try {
      const [info, rows] = await Promise.all([
        depositAPI.getPlatformInfo(),
        depositAPI.getHistory(),
      ]);
      setPlatform(info);
      setHistory(Array.isArray(rows) ? rows : []);
    } catch {
      setPlatform(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function selectCoin(symbol) {
    const sym = symbol.toUpperCase();
    setSelectedCoin(sym);
    setSearchParams(sym === 'USDT' ? {} : { coin: sym });
    setTab(FIAT_ONLY.has(sym) ? 'fiat' : 'crypto');
    setErr('');
  }

  async function submitFiat(e) {
    e.preventDefault();
    if (submitLockRef.current || busy) return;
    setErr('');
    if (!proof) {
      const message = 'Payment proof (screenshot or PDF) is required.';
      setErr(message);
      toast.warning(message);
      return;
    }
    submitLockRef.current = true;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('amount', fiatForm.amount);
      fd.append('bank_name', fiatForm.bank_name);
      fd.append('account_number', fiatForm.account_number);
      fd.append('branch', fiatForm.branch);
      fd.append('utr_number', fiatForm.utr_number);
      fd.append('payment_proof', proof);
      await depositAPI.submitFiat(fd);
      setFiatForm({ amount: '', bank_name: '', account_number: '', branch: '', utr_number: '' });
      setProof(null);
      await loadData();
    } catch (ex) {
      setErr(ex.message || 'Failed to submit deposit');
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }

  const bank = platform?.bank || {};

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-[#0b162c] shrink-0"
            style={{ background: coinColor }}
          >
            {selectedCoin.slice(0, 2)}
          </span>
          <div>
            <h1 className="text-xl font-medium text-text-primary mb-0.5">
              Deposit {selectedCoin}
            </h1>
            <p className="text-sm text-text-secondary">
              {tab === 'fiat'
                ? 'Transfer to platform bank account, then submit proof for admin approval'
                : 'Send crypto to platform wallet, then submit TX hash for approval'}
            </p>
          </div>
        </div>
        <Link to="/wallet" className="btn-secondary !h-9 text-xs no-underline px-4">
          ← Back to wallet
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {cryptoCoins.map((sym) => (
          <button
            key={sym}
            type="button"
            className={`px-3 py-1.5 rounded-btn text-xs font-medium ${
              selectedCoin === sym && tab === 'crypto'
                ? 'bg-accent/15 border border-accent/40 text-accent'
                : 'btn-secondary !h-8'
            }`}
            onClick={() => selectCoin(sym)}
          >
            {sym}
          </button>
        ))}
        <button
          type="button"
          className={`px-3 py-1.5 rounded-btn text-xs font-medium ${
            tab === 'fiat' ? 'bg-accent/15 border border-accent/40 text-accent' : 'btn-secondary !h-8'
          }`}
          onClick={() => {
            setTab('fiat');
            setSelectedCoin('INR');
            setSearchParams({ coin: 'INR' });
          }}
        >
          INR (Bank)
        </button>
      </div>

      {loading && (
        <p className="text-sm text-text-secondary flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading deposit info…
        </p>
      )}

      {tab === 'crypto' && !loading && (
        <div className="ui-card">
          {cryptoSupported ? (
            <div className="deposit-modal deposit-modal--embedded">
              <CryptoDepositView coin={selectedCoin} onSubmitted={loadData} />
            </div>
          ) : (
            <p className="text-sm text-loss">
              On-chain deposit for {selectedCoin} is not available. Choose BNB, ETH, TRX, or USDT.
            </p>
          )}
        </div>
      )}

      {tab === 'fiat' && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Column 1: Platform Bank & Official QR Scanner */}
          <div className="ui-card space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <Building2 size={18} className="text-accent" />
                Deposit to SafeXchange Account
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                Official Account
              </span>
            </div>

            {/* Official QR Scan Code */}
            {(bank.qrCode || bank.upiId) && (
              <div className="p-4 bg-bg-tertiary rounded-xl border border-border flex flex-col items-center text-center gap-3">
                <div className="p-3 bg-white rounded-xl shadow-md border border-border inline-flex items-center justify-center max-w-[220px]">
                  {bank.qrCode ? (
                    <img
                      src={resolveAssetUrl(bank.qrCode)}
                      alt="Official Payment QR"
                      className="max-h-48 max-w-[190px] object-contain rounded"
                    />
                  ) : (
                    <QRCodeSVG
                      value={`upi://pay?pa=${encodeURIComponent(bank.upiId)}&pn=${encodeURIComponent(
                        bank.holder || 'SafeXchange'
                      )}&cu=INR`}
                      size={180}
                      level="M"
                      includeMargin
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-primary flex items-center justify-center gap-1.5">
                    <Smartphone size={14} className="text-accent" /> Scan with Any UPI App
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Supports Google Pay, PhonePe, Paytm, BHIM &amp; Banking UPI Apps
                  </p>
                </div>
              </div>
            )}

            {/* Account Details Box with 1-Click Copy */}
            <div className="space-y-2.5">
              <div className="p-3 bg-bg-tertiary rounded-xl border border-border text-xs space-y-2">
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-text-muted">Bank Name:</span>
                  <span className="font-semibold text-text-primary">{bank.name || '—'}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-text-muted">Account Number:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-text-primary">{bank.account || '—'}</span>
                    {bank.account && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bank.account, 'acc')}
                        className="text-accent hover:underline flex items-center gap-0.5 text-[11px]"
                      >
                        {copiedField === 'acc' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-text-muted">IFSC Code:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-text-primary">{bank.ifsc || '—'}</span>
                    {bank.ifsc && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bank.ifsc, 'ifsc')}
                        className="text-accent hover:underline flex items-center gap-0.5 text-[11px]"
                      >
                        {copiedField === 'ifsc' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-text-muted">Account Holder:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">{bank.holder || '—'}</span>
                    {bank.holder && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bank.holder, 'holder')}
                        className="text-accent hover:underline flex items-center gap-0.5 text-[11px]"
                      >
                        {copiedField === 'holder' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                {bank.upiId && (
                  <div className="flex items-center justify-between py-1 border-b border-border/50">
                    <span className="text-text-muted">UPI ID / VPA:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-accent">{bank.upiId}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bank.upiId, 'upi')}
                        className="text-accent hover:underline flex items-center gap-0.5 text-[11px]"
                      >
                        {copiedField === 'upi' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                )}

                {bank.branch && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-text-muted">Branch:</span>
                    <span className="text-text-primary">{bank.branch}</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Important: After completing the transfer, note your transaction UTR / reference number and upload the payment receipt on the right to have your deposit credited.
              </p>
            </div>
          </div>

          {/* Column 2: User Submission Form */}
          <div className="ui-card space-y-4">
            <h2 className="text-base font-semibold text-text-primary">Submit Deposit Proof</h2>
            <form onSubmit={submitFiat} className="space-y-4">
              <Input
                label="Amount (USDT equivalent)"
                type="number"
                step="any"
                min="0"
                value={fiatForm.amount}
                onChange={(e) => setFiatForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 100"
                required
              />
              <Input
                label="Your sender bank name"
                value={fiatForm.bank_name}
                onChange={(e) => setFiatForm((f) => ({ ...f, bank_name: e.target.value }))}
                placeholder="Bank you sent from"
                required
              />
              <Input
                label="Your sender account number / UPI"
                value={fiatForm.account_number}
                onChange={(e) => setFiatForm((f) => ({ ...f, account_number: e.target.value }))}
                placeholder="Your account number or VPA"
                required
              />
              <Input
                label="Your branch (optional)"
                value={fiatForm.branch}
                onChange={(e) => setFiatForm((f) => ({ ...f, branch: e.target.value }))}
                placeholder="Branch name"
              />
              <Input
                label="UTR / Reference Number"
                value={fiatForm.utr_number}
                onChange={(e) => setFiatForm((f) => ({ ...f, utr_number: e.target.value }))}
                placeholder="12-digit UTR or transaction ID"
                required
              />
              <div>
                <label className="ui-label">Payment Proof (Screenshot / PDF)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="ui-input !py-2"
                  onChange={(e) => setProof(e.target.files?.[0] || null)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit for approval'}
              </button>
            </form>
          </div>
        </div>
      )}

      {err && (
        <p className="text-sm text-loss bg-loss/10 border border-loss/20 rounded-xl px-4 py-3">{err}</p>
      )}

      <div className="ui-card p-0 overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">Deposit history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Trading bonus</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.currency || 'USDT'}</strong></td>
                  <td className="capitalize">{d.type}</td>
                  <td className="tabular-nums">
                    {d.amount} {d.currency || 'USDT'}
                    {d.usdtAmount != null && d.currency !== 'USDT' && (
                      <span className="block text-xs text-text-muted">
                        ≈ {fmtUSD(d.usdtAmount)} USDT
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums text-accent">
                    {Number(d.bonusAmount) > 0 ? `+${fmtUSD(d.bonusAmount)}` : '—'}
                  </td>
                  <td className="text-xs text-text-secondary max-w-[200px] truncate">
                    {d.type === 'crypto' ? d.txnHash || '—' : d.utrNumber || '—'}
                  </td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="text-text-secondary text-xs">
                    {d.submittedAt ? new Date(d.submittedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {!history.length && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-text-secondary">
                    No deposits yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
