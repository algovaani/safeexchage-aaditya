import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, parseApiResponse } from '../api/client.js';
import AdminDataTable from '../components/AdminDataTable.jsx';
import StakingAdminSection from './admin/StakingAdminSection.jsx';
import { formatMarketTime } from '../utils/timeFormat.js';
import './Admin.css';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatAdminDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function UserProfileLink({ user, userId }) {
  const id = userId || user?.id || user?._id;
  const mobile = user?.mobile;
  const label = mobile || user?.email || user?.name || 'View user';
  if (!id) return label;
  return (
    <Link to={`/admin/users/${id}`} className="admin-link admin-user-link">
      {label}
    </Link>
  );
}

function CopyAddressCell({ value }) {
  const [copied, setCopied] = useState(false);
  const text = String(value || '').trim();
  if (!text) return <span className="admin-copy-key__missing">—</span>;
  const short = text.length > 14 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-copy-key">
      <code className="admin-copy-key__text" title={text}>
        {short}
      </code>
      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const SECTION_TITLES = {
  overview: 'Overview',
  users: 'Users',
  kyc: 'KYC Review',
  deposits: 'Deposits',
  wallets: 'Wallet Management',
  treasury: 'Treasury',
  settings: 'Settings',
  withdrawals: 'Withdrawals',
  wallet: 'Wallet & Transactions',
  orders: 'Orders',
  prices: 'Manual Prices',
  staking: 'Investment Plans',
};

function WalletQrPreview({ label, address }) {
  const text = String(address || '').trim();
  if (!text) {
    return (
      <div className="admin-wallet-qr">
        <p className="admin-wallet-qr__label">{label}</p>
        <p className="admin-wallet-qr__empty">Not configured</p>
      </div>
    );
  }
  return (
    <div className="admin-wallet-qr">
      <p className="admin-wallet-qr__label">{label}</p>
      <QRCodeSVG value={text} size={120} level="M" includeMargin className="admin-wallet-qr__code" />
      <code className="admin-wallet-qr__addr" title={text}>{text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text}</code>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = String(status || '').toLowerCase();
  const cls =
    s === 'pending'
      ? 'admin-badge--pending'
      : s === 'rejected' || s === 'cancelled'
        ? 'admin-badge--rejected'
        : 'admin-badge--approved';
  return <span className={`admin-badge ${cls}`}>{status}</span>;
}

function CopyPrivateKeyCell({ value }) {
  const [copied, setCopied] = useState(false);
  const key = String(value || '').trim();

  if (!key) {
    return <span className="admin-copy-key__missing">Not set</span>;
  }

  const short = key.length > 18 ? `${key.slice(0, 10)}…${key.slice(-8)}` : key;

  async function copy() {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-copy-key">
      <code className="admin-copy-key__text" title={key}>
        {short}
      </code>
      <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const KYC_DOC_FIELDS = [
  { key: 'docFront', label: 'Document Front' },
  { key: 'docBack', label: 'Document Back' },
  { key: 'selfie', label: 'Selfie' },
  { key: 'addressProof', label: 'Address Proof' },
];

function kycDocuments(files = {}) {
  return KYC_DOC_FIELDS.map(({ key, label }) => ({
    key,
    label,
    url: files[key]?.url || null,
    originalName: files[key]?.originalName || '',
  })).filter((d) => d.url);
}

function KycDocsDrawer({ row, onClose, onReview }) {
  if (!row) return null;
  const docs = kycDocuments(row.files);
  const userLabel = row.user?.email || row.user?.mobile || String(row.userId);

  return (
    <>
      <button type="button" className="admin-kyc-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="admin-kyc-drawer">
        <div className="admin-kyc-drawer__head">
          <div>
            <h2>KYC Documents</h2>
            <p>{userLabel} · {row.docType?.replace(/_/g, ' ')}</p>
          </div>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="admin-kyc-drawer__meta">
          <span>Status: <StatusBadge status={row.status} /></span>
          {row.submittedAt && (
            <span>Submitted: {new Date(row.submittedAt).toLocaleString()}</span>
          )}
        </div>

        {row.status === 'rejected' && row.adminNote && (
          <p className="admin-kyc-drawer__note">Rejection note: {row.adminNote}</p>
        )}

        <div className="admin-kyc-docs">
          {docs.length ? docs.map((doc) => (
            <div key={doc.key} className="admin-kyc-doc">
              <p className="admin-kyc-doc__label">{doc.label}</p>
              <a href={doc.url} target="_blank" rel="noreferrer" className="admin-kyc-doc__preview">
                {/\.(pdf)(\?|$)/i.test(doc.url) ? (
                  <div className="admin-kyc-doc__pdf">PDF — click to open</div>
                ) : (
                  <img src={doc.url} alt={doc.label} />
                )}
              </a>
              <a href={doc.url} target="_blank" rel="noreferrer" className="admin-link">
                {doc.originalName || 'Open full size'}
              </a>
            </div>
          )) : (
            <p className="admin-empty">No documents attached.</p>
          )}
        </div>

        {row.status === 'pending' && (
          <div className="admin-kyc-drawer__actions">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => onReview(row.id || row._id, 'approve')}
            >
              Approve
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              onClick={() => onReview(row.id || row._id, 'reject')}
            >
              Reject
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function TreasurySweepDrawer({ row, defaultAdminWallet, onClose, onSuccess }) {
  const depositId = String(row?.id || row?._id || '').trim();
  const [mode, setMode] = useState('auto');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [adminWallet, setAdminWallet] = useState(defaultAdminWallet || '');
  const [fundGasFirst, setFundGasFirst] = useState(true);
  const [notes, setNotes] = useState('');
  const [manualForm, setManualForm] = useState({
    admin_wallet_address: defaultAdminWallet || '',
    outbound_txn_hash: '',
    notes: '',
  });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    setAdminWallet(defaultAdminWallet || '');
    setManualForm({
      admin_wallet_address: defaultAdminWallet || '',
      outbound_txn_hash: '',
      notes: '',
    });
    setPreview(null);
    setResult(null);
    setErr('');
    setMode('auto');
  }, [row, defaultAdminWallet]);

  useEffect(() => {
    if (!depositId || mode !== 'auto') return;
    setPreviewLoading(true);
    setErr('');
    api
      .get(`/admin/deposits/${depositId}/sweep-preview`)
      .then(({ data }) => setPreview(parseApiResponse(data)))
      .catch((ex) => setErr(ex.message || 'Failed to load sweep preview'))
      .finally(() => setPreviewLoading(false));
  }, [depositId, mode]);

  if (!row) return null;

  async function handleFundGas() {
    setErr('');
    setBusy('gas');
    try {
      const { data } = await api.post(`/admin/deposits/${depositId}/fund-gas`);
      const payload = parseApiResponse(data);
      setResult((r) => ({ ...r, gasTx: payload?.gasTx }));
      const { data: previewData } = await api.get(`/admin/deposits/${depositId}/sweep-preview`);
      setPreview(parseApiResponse(previewData));
    } catch (ex) {
      setErr(ex.message || 'Gas funding failed');
    } finally {
      setBusy('');
    }
  }

  async function handleAutoSweep(e) {
    e.preventDefault();
    setErr('');
    setBusy('sweep');
    try {
      const { data } = await api.post(`/admin/deposits/${depositId}/sweep`, {
        admin_wallet_address: adminWallet,
        fund_gas_first: fundGasFirst,
        notes: notes || `Auto-sweep deposit ${depositId}`,
      });
      const payload = parseApiResponse(data);
      setResult(payload);
      onSuccess?.();
    } catch (ex) {
      setErr(ex.message || 'Auto sweep failed');
    } finally {
      setBusy('');
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy('manual');
    try {
      await api.post(`/admin/deposits/${depositId}/treasury-withdraw`, manualForm);
      onSuccess?.();
      onClose();
    } catch (ex) {
      setErr(ex.message || 'Failed to record treasury withdrawal');
    } finally {
      setBusy('');
    }
  }

  const balances = preview?.balances;
  const steps = preview?.steps || [];

  return (
    <>
      <button type="button" className="admin-kyc-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="admin-kyc-drawer admin-treasury-drawer">
        <div className="admin-kyc-drawer__head">
          <div>
            <h2>Sweep to admin wallet</h2>
            <p>
              {row.amount} {row.currency} · {row.userLabel || row.userId} · {row.chain || row.network}
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="admin-treasury-tabs">
          <button
            type="button"
            className={`admin-treasury-tab${mode === 'auto' ? ' admin-treasury-tab--active' : ''}`}
            onClick={() => setMode('auto')}
          >
            Auto sweep (BNB/ETH)
          </button>
          <button
            type="button"
            className={`admin-treasury-tab${mode === 'manual' ? ' admin-treasury-tab--active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Manual record
          </button>
        </div>

        <div className="admin-kyc-drawer__meta">
          <span>User deposit TX: <code className="text-xs">{row.txnHash || '—'}</code></span>
          <span>From (user node): <code className="text-xs">{row.toAddress || preview?.fromAddress || '—'}</code></span>
          {row.usdtAmount != null && <span>User credited: {row.usdtAmount} USDT</span>}
        </div>

        {mode === 'auto' && (
          <>
            {previewLoading && <p className="admin-field-hint">Loading on-chain balances…</p>}
            {!previewLoading && preview && !preview.supported && (
              <p className="admin-kyc-drawer__note">{preview.message}</p>
            )}
            {!previewLoading && preview?.supported && (
              <>
                <div className="admin-treasury-balances">
                  <div>
                    <span className="admin-treasury-balances__label">USDT on user address</span>
                    <strong>{balances?.usdt ?? '—'} USDT</strong>
                  </div>
                  <div>
                    <span className="admin-treasury-balances__label">Gas ({balances?.nativeSymbol})</span>
                    <strong>{balances?.native ?? '—'} {balances?.nativeSymbol}</strong>
                  </div>
                  <div>
                    <span className="admin-treasury-balances__label">Admin destination</span>
                    <code className="text-xs">{adminWallet || preview.adminWalletAddress || '—'}</code>
                  </div>
                </div>

                <ol className="admin-treasury-steps">
                  {steps.map((s) => (
                    <li key={s.step} className={`admin-treasury-step admin-treasury-step--${s.status}`}>
                      <strong>{s.step}. {s.title}</strong>
                      <span>{s.detail}</span>
                    </li>
                  ))}
                </ol>

                <form onSubmit={handleAutoSweep} className="admin-treasury-form">
                  <div className="admin-field">
                    <label>Admin wallet (receive USDT)</label>
                    <input
                      value={adminWallet}
                      onChange={(e) => setAdminWallet(e.target.value)}
                      required
                      placeholder="0x… admin hot wallet"
                    />
                  </div>
                  <label className="admin-treasury-check">
                    <input
                      type="checkbox"
                      checked={fundGasFirst}
                      onChange={(e) => setFundGasFirst(e.target.checked)}
                    />
                    Auto-fund gas from admin BNB/ETH wallet if user address has low balance (~{preview.gasTopUp} {balances?.nativeSymbol})
                  </label>
                  <div className="admin-field">
                    <label>Notes (optional)</label>
                    <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>

                  <div className="admin-kyc-drawer__actions admin-treasury-actions">
                    {preview.needsGas && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={Boolean(busy) || !preview.hasGasWalletKey}
                        onClick={handleFundGas}
                      >
                        {busy === 'gas' ? 'Sending gas…' : `Fund ${preview.gasTopUp} ${balances?.nativeSymbol} only`}
                      </button>
                    )}
                    <button
                      type="submit"
                      className="admin-btn admin-btn--primary"
                      disabled={Boolean(busy) || !preview.canAutoSweep}
                    >
                      {busy === 'sweep' ? 'Sweeping…' : 'Fund gas + sweep USDT'}
                    </button>
                  </div>
                </form>

                {result && (
                  <div className="admin-treasury-result">
                    <p><strong>Sweep complete</strong></p>
                    {result.gasTx && (
                      <p>Gas TX: <code className="text-xs">{result.gasTx.hash}</code> ({result.gasTx.amount} {result.gasTx.symbol})</p>
                    )}
                    {result.tokenTx && (
                      <p>USDT TX: <code className="text-xs">{result.tokenTx.hash}</code> ({result.tokenTx.amount} USDT)</p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {mode === 'manual' && (
          <>
            <p className="admin-kyc-drawer__note">
              For TRC or if you already sent USDT manually, paste your outbound transaction hash below.
            </p>
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="admin-field">
                <label>Admin wallet address (destination)</label>
                <input
                  value={manualForm.admin_wallet_address}
                  onChange={(e) => setManualForm((f) => ({ ...f, admin_wallet_address: e.target.value }))}
                  required
                />
              </div>
              <div className="admin-field">
                <label>Your outbound transaction hash</label>
                <input
                  value={manualForm.outbound_txn_hash}
                  onChange={(e) => setManualForm((f) => ({ ...f, outbound_txn_hash: e.target.value }))}
                  placeholder="TX hash when you sent crypto to admin wallet"
                  required
                />
              </div>
              <div className="admin-field">
                <label>Notes (optional)</label>
                <textarea
                  rows={3}
                  value={manualForm.notes}
                  onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="admin-kyc-drawer__actions">
                <button type="submit" className="admin-btn admin-btn--primary" disabled={busy === 'manual'}>
                  {busy === 'manual' ? 'Saving…' : 'Confirm manual treasury record'}
                </button>
              </div>
            </form>
          </>
        )}

        {err && <p style={{ color: 'var(--adm-danger, #f87171)', fontSize: '0.875rem', marginTop: '1rem' }}>{err}</p>}
      </aside>
    </>
  );
}

function UserFundDrawer({ user, onClose, onSuccess }) {
  const [form, setForm] = useState({ amount: '', remark: '' });
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [walletSnap, setWalletSnap] = useState(null);

  const action = user?.action || 'add';
  const userId = user?.id;
  const userLabel = user?.email || user?.mobile || user?.name || userId;

  useEffect(() => {
    if (!user) return;
    setWalletSnap({
      balance: Number(user.balance || 0),
      locked_balance: Number(user.locked_balance || 0),
      available_balance: Number(
        user.available_balance ?? Math.max(0, Number(user.balance || 0) - Number(user.locked_balance || 0))
      ),
    });
  }, [user]);

  useEffect(() => {
    if (!userId) return;
    setForm({ amount: '', remark: '' });
    setErr('');
    setLoadingHistory(true);
    api
      .get(`/admin/users/${userId}/fund-adjustments`)
      .then((r) => setHistory(asArray(parseApiResponse(r.data))))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [userId, action]);

  if (!user) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/users/${userId}/fund-adjustment`, {
        action,
        amount: Number(form.amount),
        remark: form.remark.trim(),
      });
      const result = parseApiResponse(data);
      setWalletSnap({
        balance: Number(result.balance ?? result.balance_usdt ?? 0),
        locked_balance: Number(result.locked_balance ?? 0),
        available_balance: Number(
          result.available_balance ??
            Math.max(0, Number(result.balance ?? result.balance_usdt ?? 0) - Number(result.locked_balance ?? 0))
        ),
      });
      setForm({ amount: '', remark: '' });
      onSuccess?.(result);
      const hist = await api.get(`/admin/users/${userId}/fund-adjustments`);
      setHistory(asArray(parseApiResponse(hist.data)));
    } catch (ex) {
      setErr(ex.response?.data?.message || ex.message || 'Failed to update balance');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="admin-kyc-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="admin-kyc-drawer">
        <div className="admin-kyc-drawer__head">
          <div>
            <h2>{action === 'add' ? 'Add fund' : 'Cut fund'}</h2>
            <p>
              {userLabel} · Total {walletSnap ? walletSnap.balance.toFixed(2) : '—'} USDT
              {walletSnap && walletSnap.locked_balance > 0
                ? ` · Available ${walletSnap.available_balance.toFixed(2)} · Locked ${walletSnap.locked_balance.toFixed(2)}`
                : ''}
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="admin-field">
            <label>Amount (USDT)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder={action === 'add' ? 'Amount to credit' : 'Amount to deduct'}
              required
            />
          </div>
          <div className="admin-field">
            <label>Remark (required)</label>
            <textarea
              rows={3}
              value={form.remark}
              onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
              placeholder="Reason shown in user transaction history"
              required
              maxLength={500}
            />
          </div>

          {err && <p style={{ color: 'var(--adm-danger, #f87171)', fontSize: '0.875rem' }}>{err}</p>}

          <div className="admin-kyc-drawer__actions">
            <button
              type="submit"
              className={`admin-btn ${action === 'add' ? 'admin-btn--primary' : 'admin-btn--danger'}`}
              disabled={busy}
            >
              {busy ? 'Saving…' : action === 'add' ? 'Add fund' : 'Cut fund'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Adjustment history</h3>
          {loadingHistory ? (
            <p className="admin-empty">Loading…</p>
          ) : history.length === 0 ? (
            <p className="admin-empty">No fund adjustments yet.</p>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Amount</th>
                    <th>Remark</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>{row.action === 'add' ? 'Added' : 'Deducted'}</td>
                      <td>{Number(row.amount).toFixed(2)} USDT</td>
                      <td>{row.remark || '—'}</td>
                      <td>{row.date ? new Date(row.date).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default function Admin() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('section') || 'overview';

  const [stats, setStats] = useState({
    users: 0,
    pendingKyc: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    pendingTx: 0,
    openOrders: 0,
    pendingTreasurySweeps: 0,
  });
  const [txs, setTxs] = useState([]);
  const [allTxs, setAllTxs] = useState([]);
  const [trades, setTrades] = useState([]);
  const [manual, setManual] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKyc, setSelectedKyc] = useState(null);
  const [fundUser, setFundUser] = useState(null);
  const [treasuryDeposit, setTreasuryDeposit] = useState(null);
  const [pendingSweeps, setPendingSweeps] = useState([]);
  const [pendingSweepsLoading, setPendingSweepsLoading] = useState(false);
  const [defaultAdminWallet, setDefaultAdminWallet] = useState('');
  const [selectedDepositIds, setSelectedDepositIds] = useState([]);
  const [depositRows, setDepositRows] = useState([]);
  const [settingsForm, setSettingsForm] = useState({
    bnbWalletAddress: '',
    ethWalletAddress: '',
    usdtWalletAddress: '',
    trcWalletAddress: '',
    depositMode: 'manual',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    bankAccountHolder: '',
    referralRewardUsdt: '',
    bnbPrivateKey: '',
    ethPrivateKey: '',
    trcPrivateKey: '',
    evmMnemonic: '',
  });
  const [settingsMeta, setSettingsMeta] = useState({
    hasBnbPrivateKey: false,
    hasEthPrivateKey: false,
    hasTrcPrivateKey: false,
    hasEvmMnemonic: false,
  });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [tableRefreshKey, setTableRefreshKey] = useState(0);

  const bumpTables = () => setTableRefreshKey((k) => k + 1);

  const [manualForm, setManualForm] = useState({
    symbol: 'BTCUSDT',
    interval: '1m',
    openTime: String(Date.now() - 60_000),
    open: '42000',
    high: '42100',
    low: '41900',
    close: '42050',
    volume: '10',
    mode: 'candle',
  });

  async function refresh() {
    setLoading(true);
    try {
      const [{ data: overview }, { data: t }, { data: tr }, { data: m }, { data: allT }] = await Promise.all([
        api.get('/admin/overview'),
        api.get('/admin/transactions'),
        api.get('/admin/exchange-trades'),
        api.get('/admin/manual-prices'),
        api.get('/admin/transactions/all'),
      ]);
      setStats(parseApiResponse(overview) || stats);
      setTxs(asArray(parseApiResponse(t)));
      setTrades(asArray(parseApiResponse(tr)));
      setManual(asArray(parseApiResponse(m)));
      setAllTxs(asArray(parseApiResponse(allT)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
    api.get('/admin/treasury/config')
      .then(({ data }) => {
        const payload = parseApiResponse(data);
        setDefaultAdminWallet(payload?.adminWalletAddress || '');
      })
      .catch(() => setDefaultAdminWallet(''));
  }, []);

  async function reviewKyc(id, action) {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Rejection reason (required):') || '';
      if (!note.trim()) return;
    }
    await api.patch(`/admin/kyc/${id}/review`, { action, note });
    setSelectedKyc(null);
    bumpTables();
    await refresh();
  }

  async function verifyDeposit(id, action, note = '') {
    await api.patch(`/admin/deposits/${id}/verify`, { action, note });
    bumpTables();
    setSelectedDepositIds([]);
    await refresh();
  }

  async function rejectDeposit(id) {
    const note = window.prompt('Rejection reason (required):') || '';
    if (!note.trim()) return;
    await verifyDeposit(id, 'reject', note);
  }

  async function bulkDepositSelected() {
    if (!selectedDepositIds.length) return;
    await api.post('/admin/deposits/bulk/approve', { ids: selectedDepositIds });
    bumpTables();
    setSelectedDepositIds([]);
    await refresh();
  }

  async function bulkWithdrawSelected() {
    if (!selectedDepositIds.length) return;
    const admin_wallet_address = window.prompt('Admin wallet address:', defaultAdminWallet) || '';
    if (!admin_wallet_address.trim()) return;
    const outbound_txn_hash = window.prompt('Outbound transaction hash (your transfer to admin wallet):') || '';
    if (!outbound_txn_hash.trim()) return;
    await api.post('/admin/deposits/bulk/treasury-withdraw', {
      ids: selectedDepositIds,
      admin_wallet_address: admin_wallet_address.trim(),
      outbound_txn_hash: outbound_txn_hash.trim(),
    });
    bumpTables();
    setSelectedDepositIds([]);
    await refresh();
  }

  function buildSettingsPayload(form) {
    const payload = {
      bnbWalletAddress: String(form.bnbWalletAddress || '').trim(),
      ethWalletAddress: String(form.ethWalletAddress || '').trim(),
      usdtWalletAddress: String(form.usdtWalletAddress || '').trim(),
      trcWalletAddress: String(form.trcWalletAddress || '').trim(),
      depositMode: form.depositMode === 'auto' ? 'auto' : 'manual',
      bankName: String(form.bankName || '').trim(),
      bankAccountNumber: String(form.bankAccountNumber || '').trim(),
      bankIfsc: String(form.bankIfsc || '').trim(),
      bankBranch: String(form.bankBranch || '').trim(),
      bankAccountHolder: String(form.bankAccountHolder || '').trim(),
      referralRewardUsdt: Number(form.referralRewardUsdt || 0),
    };
    for (const key of ['bnbPrivateKey', 'ethPrivateKey', 'trcPrivateKey', 'evmMnemonic']) {
      const val = String(form[key] || '').trim();
      if (val) payload[key] = val;
    }
    return payload;
  }

  function applySettingsResponse(s) {
    setSettingsMeta({
      hasBnbPrivateKey: Boolean(s.hasBnbPrivateKey),
      hasEthPrivateKey: Boolean(s.hasEthPrivateKey),
      hasTrcPrivateKey: Boolean(s.hasTrcPrivateKey),
      hasEvmMnemonic: Boolean(s.hasEvmMnemonic),
    });
    setSettingsForm({
      bnbWalletAddress: s.bnbWalletAddress || '',
      ethWalletAddress: s.ethWalletAddress || '',
      usdtWalletAddress: s.usdtWalletAddress || '',
      trcWalletAddress: s.trcWalletAddress || '',
      depositMode: s.depositMode || 'manual',
      bankName: s.bankName || s.bank?.name || '',
      bankAccountNumber: s.bankAccountNumber || s.bank?.account || '',
      bankIfsc: s.bankIfsc || s.bank?.ifsc || '',
      bankBranch: s.bankBranch || s.bank?.branch || '',
      bankAccountHolder: s.bankAccountHolder || s.bank?.holder || '',
      referralRewardUsdt: s.referralRewardUsdt != null ? String(s.referralRewardUsdt) : '',
      bnbPrivateKey: s.bnbPrivateKey || '',
      ethPrivateKey: s.ethPrivateKey || '',
      trcPrivateKey: s.trcPrivateKey || '',
      evmMnemonic: s.evmMnemonic || '',
    });
  }

  async function loadSettings() {
    const { data } = await api.get('/admin/settings');
    const s = parseApiResponse(data) || {};
    applySettingsResponse(s);
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSettingsBusy(true);
    try {
      const payload = buildSettingsPayload(settingsForm);
      const { data } = await api.put('/admin/settings', payload);
      const saved = parseApiResponse(data) || {};
      applySettingsResponse(saved);
    } catch {
      /* toast handled globally */
    } finally {
      setSettingsBusy(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'settings' || activeTab === 'wallets') {
      loadSettings().catch(() => {});
    }
  }, [activeTab]);

  async function loadPendingSweeps() {
    setPendingSweepsLoading(true);
    try {
      const { data } = await api.get('/admin/treasury/pending-sweeps');
      const payload = parseApiResponse(data);
      setPendingSweeps(asArray(payload?.rows || payload));
    } catch {
      setPendingSweeps([]);
    } finally {
      setPendingSweepsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'treasury') {
      loadPendingSweeps().catch(() => {});
    }
  }, [activeTab, tableRefreshKey]);

  const selectedDeposits = useMemo(
    () => depositRows.filter((r) => selectedDepositIds.includes(String(r.id || r._id))),
    [depositRows, selectedDepositIds]
  );
  const showBulkDeposit = selectedDeposits.some((r) => r.status === 'pending');
  const showBulkWithdraw = selectedDeposits.some((r) => r.canTreasuryWithdraw);

  async function verifyWithdrawal(id, action) {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Rejection reason (required):') || '';
      if (!note.trim()) return;
    }
    await api.patch(`/admin/withdrawals/${id}/verify`, { action, note });
    bumpTables();
    await refresh();
  }

  function closeTreasuryDrawer() {
    setTreasuryDeposit(null);
  }

  function onTreasurySuccess() {
    bumpTables();
    refresh().catch(() => {});
    loadPendingSweeps().catch(() => {});
  }

  async function approveTx(id, decision) {
    await api.patch(`/admin/transactions/${id}`, { decision });
    await refresh();
  }

  async function saveManual(e) {
    e.preventDefault();
    const body = {
      symbol: manualForm.symbol.toUpperCase(),
      interval: manualForm.interval,
      openTime: Number(manualForm.openTime),
      mode: manualForm.mode,
      open: parseFloat(manualForm.open),
      high: parseFloat(manualForm.high),
      low: parseFloat(manualForm.low),
      close: parseFloat(manualForm.close),
      volume: parseFloat(manualForm.volume || '0'),
    };
    await api.post('/admin/manual-prices', body);
    await refresh();
  }

  const title = SECTION_TITLES[activeTab] || 'Admin';

  const typeFilter = [
    { key: 'type', label: 'All types', options: [{ value: 'crypto', label: 'Crypto' }, { value: 'fiat', label: 'Fiat' }] },
    { key: 'status', label: 'All statuses', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] },
    { key: 'from', label: 'From', type: 'date' },
    { key: 'to', label: 'To', type: 'date' },
  ];

  const depositFilters = [
    ...typeFilter,
    { key: 'chain', label: 'All chains', options: [{ value: 'BNB', label: 'BNB' }, { value: 'ETH', label: 'ETH' }, { value: 'TRC', label: 'TRC' }] },
  ];

  const openFundDrawer = useCallback((user, action) => {
    setFundUser({
      id: user.id || user._id,
      email: user.email,
      mobile: user.mobile,
      name: user.name,
      balance: user.balance,
      locked_balance: user.locked_balance,
      available_balance: user.available_balance,
      action,
    });
  }, []);

  const userColumns = useMemo(
    () => [
      { key: 'email', label: 'Email', sortable: true, render: (u) => u.email || '—' },
      {
        key: 'mobile',
        label: 'Mobile',
        sortable: true,
        render: (u) => (
          u.mobile ? (
            <UserProfileLink user={u} userId={u.id || u._id} />
          ) : (
            '—'
          )
        ),
      },
      { key: 'name', label: 'Name', sortable: true, render: (u) => u.name || '—' },
      { key: 'role', label: 'Role', sortable: true, render: (u) => <StatusBadge status={u.role} /> },
      { key: 'status', label: 'Status', sortable: true, render: (u) => <StatusBadge status={u.status} /> },
      {
        key: 'balance',
        label: 'Balance',
        sortable: true,
        render: (u) => {
          const total = Number(u.balance || 0);
          const locked = Number(u.locked_balance || 0);
          const available = Number(u.available_balance ?? Math.max(0, total - locked));
          if (locked > 0) {
            return `${available.toFixed(2)} avail · ${locked.toFixed(2)} locked`;
          }
          return `${total.toFixed(2)} USDT`;
        },
      },
      { key: 'referralCode', label: 'Referral', render: (u) => u.referralCode || '—' },
      {
        key: 'createdAt',
        label: 'Created',
        sortable: true,
        render: (u) => (u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'),
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (u) => (
          <div className="admin-actions">
            <button
              type="button"
              className="admin-btn admin-btn--primary admin-btn--sm"
              onClick={() => openFundDrawer(u, 'add')}
            >
              Add fund
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--danger admin-btn--sm"
              onClick={() => openFundDrawer(u, 'deduct')}
            >
              Cut fund
            </button>
          </div>
        ),
      },
    ],
    [openFundDrawer]
  );

  const kycColumns = useMemo(
    () => [
      { key: 'userLabel', label: 'User', render: (row) => row.userLabel || '—' },
      { key: 'docType', label: 'Type', sortable: true, render: (row) => row.docType?.replace(/_/g, ' ') },
      {
        key: 'documents',
        label: 'Documents',
        render: (row) => (
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            onClick={() => setSelectedKyc(row)}
          >
            View all ({kycDocuments(row.files).length})
          </button>
        ),
      },
      { key: 'status', label: 'Status', sortable: true, render: (row) => <StatusBadge status={row.status} /> },
      {
        key: 'actions',
        label: 'Action',
        render: (row) =>
          row.status === 'pending' ? (
            <div className="admin-actions">
              <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => reviewKyc(row.id || row._id, 'approve')}>
                Approve
              </button>
              <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => reviewKyc(row.id || row._id, 'reject')}>
                Reject
              </button>
            </div>
          ) : (
            '—'
          ),
      },
    ],
    []
  );

  const depositColumns = useMemo(
    () => [
      {
        key: 'user',
        label: 'User',
        render: (row) => {
          const u = row.user || {};
          const id = row.userId || u.id;
          const label = u.mobile || u.email || row.userLabel || 'User';
          if (!id) return label;
          return (
            <Link to={`/admin/users/${id}`} className="admin-link admin-user-link">
              {label}
            </Link>
          );
        },
      },
      {
        key: 'amount',
        label: 'Coin',
        sortable: true,
        render: (row) => `${row.amount} ${row.currency || 'USDT'}`,
      },
      {
        key: 'usdtAmount',
        label: 'USDT',
        sortable: true,
        render: (row) => (row.usdtAmount != null ? `${Number(row.usdtAmount).toFixed(2)} USDT` : '—'),
      },
      { key: 'chain', label: 'Chain', sortable: true, render: (row) => row.chain || row.network || '—' },
      {
        key: 'txnHash',
        label: 'TX hash',
        render: (row) => (
          <span className="text-xs font-mono" title={row.txnHash}>{row.txnHash ? `${row.txnHash.slice(0, 10)}…` : '—'}</span>
        ),
      },
      { key: 'toAddress', label: 'To address', render: (row) => <CopyAddressCell value={row.toAddress} /> },
      { key: 'fromAddress', label: 'From address', render: (row) => <CopyAddressCell value={row.fromAddress} /> },
      { key: 'source', label: 'Source', render: (row) => row.source || 'user' },
      {
        key: 'privateKey',
        label: 'Private key',
        render: (row) =>
          row.type === 'crypto' ? (
            <CopyPrivateKeyCell value={row.privateKey || row.depositPrivateKey} />
          ) : (
            '—'
          ),
      },
      {
        key: 'date',
        label: 'Date',
        sortable: true,
        render: (row) => formatAdminDate(row.createdAt || row.submittedAt),
      },
      {
        key: 'time',
        label: 'Time',
        render: (row) => formatMarketTime(row.createdAt || row.submittedAt),
      },
      { key: 'status', label: 'Status', sortable: true, render: (row) => <StatusBadge status={row.status} /> },
      {
        key: 'treasury',
        label: 'Treasury',
        render: (row) => {
          if (row.type !== 'crypto' || row.status !== 'approved') return '—';
          if (row.treasuryStatus === 'swept') return <StatusBadge status="swept" />;
          return (
            <div className="admin-actions">
              <StatusBadge status="pending_sweep" />
              {(row.canTreasuryWithdraw || row.treasuryStatus === 'pending_sweep') && (
                <button
                  type="button"
                  className="admin-btn admin-btn--primary admin-btn--sm"
                  onClick={() => setTreasuryDeposit(row)}
                >
                  Sweep
                </button>
              )}
            </div>
          );
        },
      },
      {
        key: 'actions',
        label: 'Action',
        render: (row) => {
          const id = row.id || row._id;
          if (row.status === 'pending') {
            return (
              <div className="admin-actions">
                <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => verifyDeposit(id, 'approve')}>
                  Approve
                </button>
                <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => rejectDeposit(id)}>
                  Reject
                </button>
                <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => verifyDeposit(id, 'cancel', 'Cancelled')}>
                  Cancel
                </button>
              </div>
            );
          }
          if (row.status === 'approved') {
            return (
              <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => rejectDeposit(id)}>
                Reverse
              </button>
            );
          }
          return <span className="text-xs text-text-muted">Rejected</span>;
        },
      },
    ],
    []
  );

  const treasuryColumns = useMemo(
    () => [
      { key: 'userLabel', label: 'User', render: (row) => row.userLabel || '—' },
      {
        key: 'amount',
        label: 'Crypto amount',
        sortable: true,
        render: (row) => `${row.amount} ${row.currency || 'USDT'}`,
      },
      {
        key: 'usdtAmount',
        label: 'User USDT credit',
        render: (row) => (row.usdtAmount != null ? `${row.usdtAmount} USDT` : '—'),
      },
      { key: 'network', label: 'Network', render: (row) => row.network || '—' },
      {
        key: 'userTxnHash',
        label: 'User deposit TX',
        render: (row) => (
          <span className="text-xs font-mono" title={row.userTxnHash}>{row.userTxnHash ? `${row.userTxnHash.slice(0, 10)}…` : '—'}</span>
        ),
      },
      {
        key: 'fromAddress',
        label: 'From (user node)',
        render: (row) => (
          <span className="text-xs font-mono" title={row.fromAddress}>
            {row.fromAddress ? `${row.fromAddress.slice(0, 10)}…` : '—'}
          </span>
        ),
      },
      {
        key: 'adminWalletAddress',
        label: 'Admin wallet',
        render: (row) => (
          <span className="text-xs font-mono" title={row.adminWalletAddress}>
            {row.adminWalletAddress ? `${row.adminWalletAddress.slice(0, 10)}…` : '—'}
          </span>
        ),
      },
      {
        key: 'outboundTxnHash',
        label: 'USDT sweep TX',
        render: (row) => (
          <span className="text-xs font-mono" title={row.outboundTxnHash}>
            {row.outboundTxnHash ? `${row.outboundTxnHash.slice(0, 10)}…` : '—'}
          </span>
        ),
      },
      {
        key: 'gasTxHash',
        label: 'Gas TX',
        render: (row) => (
          <span className="text-xs font-mono" title={row.gasTxHash}>
            {row.gasTxHash ? `${row.gasTxHash.slice(0, 10)}…` : '—'}
          </span>
        ),
      },
      { key: 'sweepMode', label: 'Mode', render: (row) => row.sweepMode || 'manual' },
      { key: 'status', label: 'Status', sortable: true, render: (row) => <StatusBadge status={row.status} /> },
      {
        key: 'createdAt',
        label: 'Recorded',
        sortable: true,
        render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'),
      },
    ],
    []
  );

  const withdrawalColumns = useMemo(
    () => [
      { key: 'userLabel', label: 'User', render: (row) => row.userLabel || '—' },
      { key: 'type', label: 'Type', sortable: true, render: (row) => <span className="capitalize">{row.type}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => `${row.amount} ${row.currency || 'USDT'}` },
      { key: 'destination', label: 'Destination', render: (row) => row.destination || '—' },
      { key: 'status', label: 'Status', sortable: true, render: (row) => <StatusBadge status={row.status} /> },
      {
        key: 'actions',
        label: 'Action',
        render: (row) =>
          row.status === 'pending' ? (
            <div className="admin-actions">
              <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => verifyWithdrawal(row.id, 'approve')}>Approve</button>
              <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => verifyWithdrawal(row.id, 'reject')}>Reject</button>
            </div>
          ) : (
            <span className="text-xs text-text-muted">{row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : '—'}</span>
          ),
      },
    ],
    []
  );

  const orderColumns = useMemo(
    () => [
      { key: 'userLabel', label: 'User', render: (o) => o.userLabel || '—' },
      { key: 'symbol', label: 'Symbol', sortable: true },
      { key: 'side', label: 'Side', sortable: true },
      { key: 'orderType', label: 'Type', sortable: true },
      { key: 'quantity', label: 'Qty', sortable: true },
      { key: 'status', label: 'Status', sortable: true, render: (o) => <StatusBadge status={o.status} /> },
      {
        key: 'createdAt',
        label: 'Created',
        sortable: true,
        render: (o) => (o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'),
      },
    ],
    []
  );

  return (
    <div>
      <header className="admin-page__head">
        <h1>{title}</h1>
        <p>Manage users, compliance, wallets, orders, and price overrides.</p>
      </header>

      {loading && <p className="admin-loading">Loading data…</p>}

      {activeTab === 'overview' && (
        <>
          <div className="admin-stats">
            <div className="admin-stat">
              <p className="admin-stat__label">Users</p>
              <p className="admin-stat__value">{stats.users}</p>
            </div>
            <div className="admin-stat">
              <p className="admin-stat__label">Pending KYC</p>
              <p className="admin-stat__value admin-stat__value--warn">{stats.pendingKyc}</p>
            </div>
            <div className="admin-stat">
              <p className="admin-stat__label">Pending Deposits</p>
              <p className="admin-stat__value admin-stat__value--warn">{stats.pendingDeposits}</p>
            </div>
            <div className="admin-stat">
              <p className="admin-stat__label">Pending Withdrawals</p>
              <p className="admin-stat__value admin-stat__value--warn">{stats.pendingWithdrawals}</p>
            </div>
            <div className="admin-stat">
              <p className="admin-stat__label">Pending Tx</p>
              <p className="admin-stat__value admin-stat__value--warn">{stats.pendingTx}</p>
            </div>
            <div className="admin-stat">
              <p className="admin-stat__label">Treasury to sweep</p>
              <p className="admin-stat__value admin-stat__value--warn">{stats.pendingTreasurySweeps}</p>
            </div>
            <div className="admin-stat">
              <p className="admin-stat__label">Open Orders</p>
              <p className="admin-stat__value admin-stat__value--ok">{stats.openOrders}</p>
            </div>
          </div>

          <div className="admin-card">
            <h2>Recent Trades</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 15).map((x) => (
                    <tr key={x._id}>
                      <td>{x.symbol}</td>
                      <td>{x.price}</td>
                      <td>{x.quantity}</td>
                      <td>{new Date(x.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {!trades.length && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        No trades yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'users' && (
        <>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Use <strong>Add fund</strong> or <strong>Cut fund</strong> to adjust a user&apos;s USDT balance. A remark is
            required and appears in the user&apos;s transaction history.
          </p>
          <AdminDataTable
            title="All Users"
            endpoint="/admin/users"
            columns={userColumns}
            filters={[
              { key: 'role', label: 'All roles', options: [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }, { value: 'system', label: 'System' }] },
              { key: 'status', label: 'All statuses', options: [{ value: 'active', label: 'Active' }, { value: 'blocked', label: 'Blocked' }] },
              { key: 'from', label: 'From', type: 'date' },
              { key: 'to', label: 'To', type: 'date' },
            ]}
            exportFilename="users.csv"
            refreshKey={tableRefreshKey}
            emptyMessage="No users found."
          />
          <UserFundDrawer
            user={fundUser}
            onClose={() => setFundUser(null)}
            onSuccess={bumpTables}
          />
        </>
      )}

      {activeTab === 'kyc' && (
        <>
          <AdminDataTable
            title="KYC Queue"
            endpoint="/admin/kyc"
            columns={kycColumns}
            filters={[
              { key: 'status', label: 'All statuses', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] },
              { key: 'docType', label: 'All doc types', options: [{ value: 'passport', label: 'Passport' }, { value: 'driving_license', label: 'Driving License' }, { value: 'national_id', label: 'National ID' }] },
              { key: 'from', label: 'From', type: 'date' },
              { key: 'to', label: 'To', type: 'date' },
            ]}
            exportFilename="kyc.csv"
            refreshKey={tableRefreshKey}
            emptyMessage="No KYC submissions."
          />
          <KycDocsDrawer row={selectedKyc} onClose={() => setSelectedKyc(null)} onReview={reviewKyc} />
        </>
      )}

      {activeTab === 'deposits' && (
        <>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Users submit deposits manually with TX hash and amount. Review each row and <strong>Approve</strong> to credit
            their wallet, or <strong>Reject / Cancel</strong> with a remark. Configure deposit addresses in Wallet Management.
          </p>
          <AdminDataTable
            title="Deposits"
            endpoint="/admin/deposits"
            columns={depositColumns}
            filters={depositFilters}
            exportFilename="deposits.csv"
            refreshKey={tableRefreshKey}
            emptyMessage="No deposits yet."
            selectable
            selectedIds={selectedDepositIds}
            onSelectionChange={setSelectedDepositIds}
            onRowsChange={setDepositRows}
          />
          {selectedDepositIds.length > 0 && (
            <div className="admin-bulk-bar">
              <span>{selectedDepositIds.length} selected</span>
              <div className="admin-bulk-bar__actions">
                {showBulkDeposit && (
                  <button type="button" className="admin-btn admin-btn--primary" onClick={bulkDepositSelected}>
                    Approve selected
                  </button>
                )}
                {showBulkWithdraw && (
                  <button type="button" className="admin-btn admin-btn--ghost" onClick={bulkWithdrawSelected}>
                    Withdraw
                  </button>
                )}
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setSelectedDepositIds([])}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'wallets' && (
        <div className="admin-card">
          <h2>Wallet management</h2>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            These addresses and bank details are shown to users when they deposit. Users send funds manually and submit TX details.
            Approve deposits from the Deposits tab to credit their wallet.
          </p>
          <form className="admin-form-grid" onSubmit={saveSettings}>
            <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
              <label>Deposit mode</label>
              <select
                value={settingsForm.depositMode}
                onChange={(e) => setSettingsForm((f) => ({ ...f, depositMode: e.target.value }))}
              >
                <option value="manual">Manual — user submits TX, admin approves</option>
                <option value="auto">Auto — chain watcher credits (legacy)</option>
              </select>
            </div>

            <div className="admin-field">
              <label>BNB wallet address (BEP20)</label>
              <input value={settingsForm.bnbWalletAddress} onChange={(e) => setSettingsForm((f) => ({ ...f, bnbWalletAddress: e.target.value }))} placeholder="0x…" />
            </div>
            <div className="admin-field">
              <label>ETH wallet address (ERC20)</label>
              <input value={settingsForm.ethWalletAddress} onChange={(e) => setSettingsForm((f) => ({ ...f, ethWalletAddress: e.target.value }))} placeholder="0x…" />
            </div>
            <div className="admin-field">
              <label>USDT wallet address</label>
              <input value={settingsForm.usdtWalletAddress} onChange={(e) => setSettingsForm((f) => ({ ...f, usdtWalletAddress: e.target.value }))} placeholder="TRC20 / shared USDT" />
            </div>
            <div className="admin-field">
              <label>TRX / TRON wallet address</label>
              <input value={settingsForm.trcWalletAddress} onChange={(e) => setSettingsForm((f) => ({ ...f, trcWalletAddress: e.target.value }))} placeholder="T…" />
            </div>

            <div className="admin-wallet-qr-grid" style={{ gridColumn: '1 / -1' }}>
              <WalletQrPreview label="BNB QR" address={settingsForm.bnbWalletAddress} />
              <WalletQrPreview label="ETH QR" address={settingsForm.ethWalletAddress} />
              <WalletQrPreview label="USDT QR" address={settingsForm.usdtWalletAddress || settingsForm.trcWalletAddress} />
              <WalletQrPreview label="TRX QR" address={settingsForm.trcWalletAddress} />
            </div>

            <div className="admin-field" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>INR bank details</h3>
            </div>
            <div className="admin-field">
              <label>Bank name</label>
              <input value={settingsForm.bankName} onChange={(e) => setSettingsForm((f) => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="admin-field">
              <label>Account holder name</label>
              <input value={settingsForm.bankAccountHolder} onChange={(e) => setSettingsForm((f) => ({ ...f, bankAccountHolder: e.target.value }))} />
            </div>
            <div className="admin-field">
              <label>Account number</label>
              <input value={settingsForm.bankAccountNumber} onChange={(e) => setSettingsForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} />
            </div>
            <div className="admin-field">
              <label>IFSC code</label>
              <input value={settingsForm.bankIfsc} onChange={(e) => setSettingsForm((f) => ({ ...f, bankIfsc: e.target.value }))} />
            </div>
            <div className="admin-field">
              <label>Branch</label>
              <input value={settingsForm.bankBranch} onChange={(e) => setSettingsForm((f) => ({ ...f, bankBranch: e.target.value }))} />
            </div>

            <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={settingsBusy}>
                {settingsBusy ? 'Saving…' : 'Save wallet management'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="admin-card">
          <h2>Platform wallet settings</h2>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Deposits are auto-detected and credited to user wallets.
            <strong> BNB/ETH</strong> use Moralis API (set <code>MORALIS_API_KEY</code> in server .env).
            <strong> TRON</strong> uses public TronGrid.
            <strong> Important:</strong> enable <strong>EVM mnemonic</strong> below so each user gets a unique BNB/ETH address.
            Shared deposit addresses disable auto-credit for safety.
          </p>
          <form className="admin-form-grid" onSubmit={saveSettings}>
            <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
              <label>Referral reward (USDT per signup)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settingsForm.referralRewardUsdt}
                onChange={(e) => setSettingsForm((f) => ({ ...f, referralRewardUsdt: e.target.value }))}
                placeholder="e.g. 10 — credited to referrer when someone uses their code"
              />
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--adm-muted)' }}>
                When a new user registers with a referral code, this amount is added to the referrer&apos;s wallet and a transaction is created. Set 0 to disable.
              </p>
            </div>
            <div className="admin-field">
              <label>
                BNB wallet address (BEP20){' '}
                {settingsForm.bnbWalletAddress?.trim().startsWith('0x') && (
                  <span className="admin-settings-badge">Configured</span>
                )}
              </label>
              <input value={settingsForm.bnbWalletAddress} onChange={(e) => setSettingsForm((f) => ({ ...f, bnbWalletAddress: e.target.value }))} placeholder="0x…" />
            </div>
            <div className="admin-field">
              <label>
                ETH wallet address (ERC20){' '}
                {settingsForm.ethWalletAddress?.trim().startsWith('0x') && (
                  <span className="admin-settings-badge">Configured</span>
                )}
              </label>
              <input value={settingsForm.ethWalletAddress} onChange={(e) => setSettingsForm((f) => ({ ...f, ethWalletAddress: e.target.value }))} placeholder="0x…" />
            </div>
            <div className="admin-field">
              <label>
                TRC wallet address (TRON){' '}
                {settingsForm.trcWalletAddress?.trim().startsWith('T') && (
                  <span className="admin-settings-badge">Configured</span>
                )}
              </label>
              <input
                value={settingsForm.trcWalletAddress}
                onChange={(e) => setSettingsForm((f) => ({ ...f, trcWalletAddress: e.target.value }))}
                placeholder="T… (TRON address — not 0x)"
              />
            </div>
            <div className="admin-field">
              <label>
                BNB private key {settingsMeta.hasBnbPrivateKey && <span className="admin-settings-badge">Configured</span>}
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="admin-secret-input"
                value={settingsForm.bnbPrivateKey}
                onChange={(e) => setSettingsForm((f) => ({ ...f, bnbPrivateKey: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="admin-field">
              <label>
                ETH private key {settingsMeta.hasEthPrivateKey && <span className="admin-settings-badge">Configured</span>}
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="admin-secret-input"
                value={settingsForm.ethPrivateKey}
                onChange={(e) => setSettingsForm((f) => ({ ...f, ethPrivateKey: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="admin-field">
              <label>
                TRC private key {settingsMeta.hasTrcPrivateKey && <span className="admin-settings-badge">Configured</span>}
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="admin-secret-input"
                value={settingsForm.trcPrivateKey}
                onChange={(e) => setSettingsForm((f) => ({ ...f, trcPrivateKey: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="admin-field">
              <label>
                EVM mnemonic / derivation secret{' '}
                {settingsMeta.hasEvmMnemonic && <span className="admin-settings-badge">Configured</span>}
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="admin-secret-input"
                value={settingsForm.evmMnemonic}
                onChange={(e) => setSettingsForm((f) => ({ ...f, evmMnemonic: e.target.value }))}
                placeholder="12-word BIP-39 phrase or passphrase (min 4 chars)"
              />
              <p className="admin-field-hint" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--adm-muted)' }}>
                Each user gets a unique BNB, ETH, and TRON deposit address derived from this secret.
              </p>
            </div>
            <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={settingsBusy}>
                {settingsBusy ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'treasury' && (
        <>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Move USDT from user deposit node addresses to your admin wallet. BNB/ETH: use Auto sweep — gas is topped up from admin hot wallet when needed.
            TRC: use Manual record after sending from Tron wallet.
          </p>

          <div className="admin-card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Pending sweeps</h2>
              <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => loadPendingSweeps()}>
                Refresh
              </button>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Amount</th>
                    <th>Chain</th>
                    <th>User node address</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSweepsLoading && (
                    <tr><td colSpan={6} className="admin-empty">Loading…</td></tr>
                  )}
                  {!pendingSweepsLoading && pendingSweeps.map((row) => (
                    <tr key={row.id || row._id}>
                      <td>{row.userLabel || '—'}</td>
                      <td>{row.amount} {row.currency}</td>
                      <td>{row.chain || row.network}</td>
                      <td><code className="text-xs">{row.toAddress ? `${row.toAddress.slice(0, 8)}…` : '—'}</code></td>
                      <td>{formatAdminDate(row.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary admin-btn--sm"
                          onClick={() => setTreasuryDeposit(row)}
                        >
                          Sweep to admin
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!pendingSweepsLoading && !pendingSweeps.length && (
                    <tr><td colSpan={6} className="admin-empty">No pending sweeps — all deposits moved to admin wallet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <AdminDataTable
            title="Treasury withdrawals"
            endpoint="/admin/treasury-withdrawals"
            columns={treasuryColumns}
            filters={[
              { key: 'status', label: 'All statuses', options: [{ value: 'completed', label: 'Completed' }, { value: 'pending', label: 'Pending' }] },
              { key: 'from', label: 'From', type: 'date' },
              { key: 'to', label: 'To', type: 'date' },
            ]}
            exportFilename="treasury-withdrawals.csv"
            refreshKey={tableRefreshKey}
            emptyMessage="No treasury withdrawals recorded yet."
          />
        </>
      )}

      {activeTab === 'withdrawals' && (
        <>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Approve crypto (wallet address) and fiat (bank transfer) withdrawal requests.
          </p>
          <AdminDataTable
            title="Withdrawal verification"
            endpoint="/admin/withdrawals"
            columns={withdrawalColumns}
            filters={typeFilter}
            exportFilename="withdrawals.csv"
            refreshKey={tableRefreshKey}
            emptyMessage="No withdrawal requests."
          />
        </>
      )}

      {activeTab === 'wallet' && (
        <div className="admin-grid-2">
          <div className="admin-card">
            <h2>Pending Transactions</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t._id}>
                      <td style={{ color: 'var(--adm-muted)' }}>{String(t.userId)}</td>
                      <td>{t.type}</td>
                      <td>{t.amount}</td>
                      <td>
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--primary admin-btn--sm"
                            onClick={() => approveTx(t._id, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger admin-btn--sm"
                            onClick={() => approveTx(t._id, 'reject')}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!txs.length && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        No pending transactions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-card">
            <h2>All Transactions</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allTxs.slice(0, 80).map((t) => (
                    <tr key={t._id}>
                      <td style={{ color: 'var(--adm-muted)' }}>{String(t.userId)}</td>
                      <td>{t.type}</td>
                      <td>{t.amount}</td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                  {!allTxs.length && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        No transactions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <AdminDataTable
          title="All Orders"
          endpoint="/admin/orders"
          columns={orderColumns}
          filters={[
            { key: 'status', label: 'All statuses', options: [{ value: 'open', label: 'Open' }, { value: 'partially_filled', label: 'Partial' }, { value: 'filled', label: 'Filled' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'rejected', label: 'Rejected' }] },
            { key: 'side', label: 'All sides', options: [{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }] },
            { key: 'orderType', label: 'All types', options: [{ value: 'market', label: 'Market' }, { value: 'limit', label: 'Limit' }] },
            { key: 'from', label: 'From', type: 'date' },
            { key: 'to', label: 'To', type: 'date' },
          ]}
          exportFilename="orders.csv"
          refreshKey={tableRefreshKey}
          emptyMessage="No orders."
        />
      )}

      {activeTab === 'prices' && (
        <>
          <div className="admin-card">
            <h2>Manual Price (Merge Layer)</h2>
            <form className="admin-form-grid" onSubmit={saveManual}>
              <div className="admin-field">
                <label>Symbol</label>
                <input value={manualForm.symbol} onChange={(e) => setManualForm({ ...manualForm, symbol: e.target.value })} />
              </div>
              <div className="admin-field">
                <label>Interval</label>
                <select value={manualForm.interval} onChange={(e) => setManualForm({ ...manualForm, interval: e.target.value })}>
                  <option value="1s">1s</option>
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Open time (ms)</label>
                <input value={manualForm.openTime} onChange={(e) => setManualForm({ ...manualForm, openTime: e.target.value })} />
              </div>
              <div className="admin-field">
                <label>Mode</label>
                <select value={manualForm.mode} onChange={(e) => setManualForm({ ...manualForm, mode: e.target.value })}>
                  <option value="candle">candle</option>
                  <option value="tick">tick</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Open</label>
                <input value={manualForm.open} onChange={(e) => setManualForm({ ...manualForm, open: e.target.value })} />
              </div>
              <div className="admin-field">
                <label>High</label>
                <input value={manualForm.high} onChange={(e) => setManualForm({ ...manualForm, high: e.target.value })} />
              </div>
              <div className="admin-field">
                <label>Low</label>
                <input value={manualForm.low} onChange={(e) => setManualForm({ ...manualForm, low: e.target.value })} />
              </div>
              <div className="admin-field">
                <label>Close</label>
                <input value={manualForm.close} onChange={(e) => setManualForm({ ...manualForm, close: e.target.value })} />
              </div>
              <div className="admin-field">
                <label>Volume</label>
                <input value={manualForm.volume} onChange={(e) => setManualForm({ ...manualForm, volume: e.target.value })} />
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button className="admin-btn admin-btn--primary" type="submit">
                  Save manual candle
                </button>
              </div>
            </form>
          </div>

          <div className="admin-card">
            <h2>Manual Overrides</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Interval</th>
                    <th>Open time</th>
                    <th>Close</th>
                  </tr>
                </thead>
                <tbody>
                  {manual.slice(0, 50).map((m) => (
                    <tr key={m._id}>
                      <td>{m.symbol}</td>
                      <td>{m.interval}</td>
                      <td>{m.openTime}</td>
                      <td>{m.close ?? m.price}</td>
                    </tr>
                  ))}
                  {!manual.length && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        No manual overrides.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'staking' && (
        <StakingAdminSection refreshKey={tableRefreshKey} onMutate={bumpTables} />
      )}

      {treasuryDeposit && (
        <TreasurySweepDrawer
          row={treasuryDeposit}
          defaultAdminWallet={defaultAdminWallet}
          onClose={closeTreasuryDrawer}
          onSuccess={onTreasurySuccess}
        />
      )}
    </div>
  );
}
