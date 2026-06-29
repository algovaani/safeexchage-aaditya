import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { depositAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { COIN_COLORS, FIAT_DEPOSIT_SYMBOLS } from '../config/depositNetworks.js';
import { isCryptoDepositSupported } from '../config/cryptoDepositChains.js';
import { WALLET_ASSETS } from '../theme/assets.js';
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
    setErr('');
    if (!proof) {
      const message = 'Payment proof (screenshot or PDF) is required.';
      setErr(message);
      toast.warning(message);
      return;
    }
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="ui-card space-y-4">
            <h2 className="text-sm font-medium text-text-primary">Bank transfer (INR)</h2>
            <div className="p-3 bg-bg-tertiary rounded-xl border border-border text-sm space-y-1">
              <p><span className="text-text-muted">Bank:</span> {bank.name || '—'}</p>
              <p><span className="text-text-muted">Account:</span> {bank.account || '—'}</p>
              <p><span className="text-text-muted">IFSC:</span> {bank.ifsc || '—'}</p>
              <p><span className="text-text-muted">Branch:</span> {bank.branch || '—'}</p>
              <p><span className="text-text-muted">Account holder:</span> {bank.holder || '—'}</p>
            </div>
            <form onSubmit={submitFiat} className="space-y-4">
              <Input label="Amount (USDT equivalent)" type="number" step="any" min="0" value={fiatForm.amount} onChange={(e) => setFiatForm((f) => ({ ...f, amount: e.target.value }))} required />
              <Input label="Your bank name" value={fiatForm.bank_name} onChange={(e) => setFiatForm((f) => ({ ...f, bank_name: e.target.value }))} required />
              <Input label="Your account number" value={fiatForm.account_number} onChange={(e) => setFiatForm((f) => ({ ...f, account_number: e.target.value }))} required />
              <Input label="Your branch" value={fiatForm.branch} onChange={(e) => setFiatForm((f) => ({ ...f, branch: e.target.value }))} />
              <Input label="UTR / reference number" value={fiatForm.utr_number} onChange={(e) => setFiatForm((f) => ({ ...f, utr_number: e.target.value }))} required />
              <div>
                <label className="ui-label">Payment proof</label>
                <input type="file" accept="image/jpeg,image/png,application/pdf" className="ui-input !py-2" onChange={(e) => setProof(e.target.files?.[0] || null)} required />
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
                  <td colSpan={6} className="text-center py-10 text-text-secondary">
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
