import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Loader2 } from 'lucide-react';
import { depositAPI, getApiErrorMessage } from '../services/api.js';
import {
  COIN_COLORS,
  FIAT_DEPOSIT_SYMBOLS,
  getNetworksForCoin,
  txnHashPlaceholder,
} from '../config/depositNetworks.js';
import { WALLET_ASSETS } from '../theme/assets.js';
import Input from '../components/ui/Input.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';

const FIAT_ONLY = FIAT_DEPOSIT_SYMBOLS;

export default function Deposit() {
  const [searchParams, setSearchParams] = useSearchParams();
  const coinParam = (searchParams.get('coin') || 'USDT').toUpperCase();

  const [selectedCoin, setSelectedCoin] = useState(coinParam);
  const [tab, setTab] = useState(FIAT_ONLY.has(coinParam) ? 'fiat' : 'crypto');
  const [platform, setPlatform] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const networks = useMemo(() => getNetworksForCoin(selectedCoin, platform), [selectedCoin, platform]);
  const [chainId, setChainId] = useState(networks?.[0]?.id ?? '');

  const chain = networks?.find((n) => n.id === chainId) || networks?.[0];
  const address = chain?.address || '';
  const apiNetwork = chain?.apiNetwork || 'TRC20';
  const coinColor = COIN_COLORS[selectedCoin] || '#f0b90b';

  const [cryptoForm, setCryptoForm] = useState({ amount: '', txn_hash: '' });
  const [fiatForm, setFiatForm] = useState({
    amount: '',
    bank_name: '',
    account_number: '',
    utr_number: '',
  });
  const [proof, setProof] = useState(null);

  const cryptoCoins = useMemo(
    () => WALLET_ASSETS.map((a) => a.symbol).filter((s) => !FIAT_ONLY.has(s)),
    []
  );

  useEffect(() => {
    setSelectedCoin(coinParam);
    setTab(FIAT_ONLY.has(coinParam) ? 'fiat' : 'crypto');
  }, [coinParam]);

  useEffect(() => {
    setChainId(networks?.[0]?.id ?? '');
  }, [selectedCoin, networks]);

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
    setMsg('');
  }

  async function submitCrypto(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await depositAPI.submitCrypto({
        amount: parseFloat(cryptoForm.amount),
        txn_hash: cryptoForm.txn_hash.trim(),
        network: apiNetwork,
        currency: selectedCoin,
      });
      setCryptoForm({ amount: '', txn_hash: '' });
      setMsg(`${selectedCoin} deposit submitted. Admin will verify your transaction.`);
      await loadData();
    } catch (ex) {
      setErr(getApiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  async function submitFiat(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!proof) {
      setErr('Payment proof (screenshot or PDF) is required.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('amount', fiatForm.amount);
      fd.append('bank_name', fiatForm.bank_name);
      fd.append('account_number', fiatForm.account_number);
      fd.append('utr_number', fiatForm.utr_number);
      fd.append('payment_proof', proof);
      await depositAPI.submitFiat(fd);
      setFiatForm({ amount: '', bank_name: '', account_number: '', utr_number: '' });
      setProof(null);
      setMsg('Bank transfer submitted. Admin will verify your payment proof.');
      await loadData();
    } catch (ex) {
      setErr(getApiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  function copyAddress() {
    if (address) navigator.clipboard.writeText(address);
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
                ? 'Bank transfer — admin approval required'
                : `Send ${selectedCoin} on ${chain?.label || 'selected network'}`}
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
          <div className="ui-card space-y-4">
            <h2 className="text-sm font-medium text-text-primary">
              {selectedCoin} deposit address
            </h2>
            <p className="text-xs text-amber">
              Send only {selectedCoin} on the selected network. Wrong network may result in lost funds.
            </p>

            {networks && networks.length > 1 && (
              <div>
                <label className="ui-label">Network</label>
                <select
                  className="ui-input"
                  value={chainId}
                  onChange={(e) => setChainId(e.target.value)}
                >
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-3 bg-bg-tertiary rounded-xl border border-border">
              <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
                Platform wallet ({chain?.label || apiNetwork})
              </p>
              <div className="flex items-start gap-2">
                <code className="text-xs break-all flex-1 text-text-primary">{address || '—'}</code>
                <button
                  type="button"
                  className="btn-secondary !h-8 !px-2 shrink-0"
                  onClick={copyAddress}
                  disabled={!address}
                  aria-label="Copy address"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <form onSubmit={submitCrypto} className="space-y-4 pt-2">
              <Input
                label={`Amount (${selectedCoin})`}
                type="number"
                step="any"
                min="0"
                placeholder="100.00"
                value={cryptoForm.amount}
                onChange={(e) => setCryptoForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
              <Input
                label="Transaction hash"
                placeholder={txnHashPlaceholder(apiNetwork)}
                value={cryptoForm.txn_hash}
                onChange={(e) => setCryptoForm((f) => ({ ...f, txn_hash: e.target.value }))}
                required
              />
              <button type="submit" className="btn-primary w-full" disabled={busy || !address}>
                {busy ? 'Submitting…' : `Submit ${selectedCoin} deposit`}
              </button>
            </form>
          </div>

          <div className="ui-card flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-sm font-medium text-text-primary">Scan to deposit {selectedCoin}</p>
            {address ? (
              <div className="p-2 bg-white rounded-xl">
                <QRCodeSVG value={address} size={180} level="M" includeMargin />
              </div>
            ) : (
              <p className="text-sm text-text-muted">Address not configured</p>
            )}
            <ol className="text-xs text-text-secondary space-y-1 list-decimal list-inside w-full max-w-xs">
              <li>Scan QR or copy address</li>
              <li>Send {selectedCoin} from your wallet</li>
              <li>Submit transaction hash below</li>
            </ol>
          </div>
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
              <p><span className="text-text-muted">Account holder:</span> {bank.holder || '—'}</p>
            </div>
            <form onSubmit={submitFiat} className="space-y-4">
              <Input label="Amount (USDT equivalent)" type="number" step="any" min="0" value={fiatForm.amount} onChange={(e) => setFiatForm((f) => ({ ...f, amount: e.target.value }))} required />
              <Input label="Your bank name" value={fiatForm.bank_name} onChange={(e) => setFiatForm((f) => ({ ...f, bank_name: e.target.value }))} required />
              <Input label="Your account number" value={fiatForm.account_number} onChange={(e) => setFiatForm((f) => ({ ...f, account_number: e.target.value }))} required />
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
      {msg && (
        <p className="text-sm text-profit bg-profit/10 border border-profit/20 rounded-xl px-4 py-3">{msg}</p>
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
                  <td className="tabular-nums">{d.amount} {d.currency || 'USDT'}</td>
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
