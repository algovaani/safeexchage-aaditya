import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, parseApiResponse } from '../api/client.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
import './Admin.css';

const SECTION_TITLES = {
  overview: 'Overview',
  users: 'Users',
  kyc: 'KYC Review',
  deposits: 'Deposits',
  withdrawals: 'Withdrawals',
  wallet: 'Wallet & Transactions',
  orders: 'Orders',
  prices: 'Manual Prices',
};

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

export default function Admin() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('section') || 'overview';

  const [users, setUsers] = useState([]);
  const [kyc, setKyc] = useState([]);
  const [txs, setTxs] = useState([]);
  const [allTxs, setAllTxs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [manual, setManual] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedKyc, setSelectedKyc] = useState(null);

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

  const stats = useMemo(
    () => ({
      users: users.length,
      pendingKyc: kyc.filter((x) => x.status === 'pending').length,
      pendingDeposits: deposits.filter((x) => x.status === 'pending').length,
      pendingWithdrawals: withdrawals.filter((x) => x.status === 'pending').length,
      pendingTx: txs.length,
      openOrders: orders.filter((x) => x.status === 'open').length,
    }),
    [users, kyc, deposits, withdrawals, txs, orders]
  );

  async function refresh() {
    setLoading(true);
    try {
      const [{ data: u }, { data: k }, { data: t }, { data: tr }, { data: m }, { data: allT }, { data: allO }, { data: dep }, { data: wdr }] =
        await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/kyc'),
          api.get('/admin/transactions'),
          api.get('/admin/exchange-trades'),
          api.get('/admin/manual-prices'),
          api.get('/admin/transactions/all'),
          api.get('/admin/orders'),
          api.get('/admin/deposits'),
          api.get('/admin/withdrawals'),
        ]);
      setUsers(asArray(parseApiResponse(u)));
      setKyc(asArray(parseApiResponse(k)));
      setTxs(asArray(parseApiResponse(t)));
      setTrades(asArray(parseApiResponse(tr)));
      setManual(asArray(parseApiResponse(m)));
      setAllTxs(asArray(parseApiResponse(allT)));
      setOrders(asArray(parseApiResponse(allO)));
      setDeposits(asArray(parseApiResponse(dep)));
      setWithdrawals(asArray(parseApiResponse(wdr)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function reviewKyc(id, action) {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Rejection reason (required):') || '';
      if (!note.trim()) return;
    }
    await api.patch(`/admin/kyc/${id}/review`, { action, note });
    setSelectedKyc(null);
    await refresh();
  }

  async function verifyDeposit(id, action) {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Rejection reason (required):') || '';
      if (!note.trim()) return;
    }
    await api.patch(`/admin/deposits/${id}/verify`, { action, note });
    await refresh();
  }

  async function verifyWithdrawal(id, action) {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Rejection reason (required):') || '';
      if (!note.trim()) return;
    }
    await api.patch(`/admin/withdrawals/${id}/verify`, { action, note });
    await refresh();
  }

  async function approveTx(id, decision) {
    await api.patch(`/admin/transactions/${id}`, { decision });
    await refresh();
  }

  async function saveManual(e) {
    e.preventDefault();
    setMsg('');
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
    setMsg('Manual candle saved and broadcasted.');
    await refresh();
  }

  const title = SECTION_TITLES[activeTab] || 'Admin';

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
        <div className="admin-card">
          <h2>All Users ({users.length})</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.email}</td>
                    <td>
                      <StatusBadge status={u.role} />
                    </td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {!users.length && (
                  <tr>
                    <td colSpan={3} className="admin-empty">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'kyc' && (
        <div className="admin-card">
          <h2>KYC Queue</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Type</th>
                  <th>Documents</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {kyc.map((row) => {
                  const docCount = kycDocuments(row.files).length;
                  return (
                  <tr key={row.id || row._id}>
                    <td style={{ color: 'var(--adm-muted)' }}>
                      {row.user?.email || row.user?.mobile || String(row.userId)}
                    </td>
                    <td>{row.docType}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        onClick={() => setSelectedKyc(row)}
                      >
                        View all ({docCount})
                      </button>
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      {row.status === 'pending' && (
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--primary admin-btn--sm"
                            onClick={() => reviewKyc(row.id || row._id, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger admin-btn--sm"
                            onClick={() => reviewKyc(row.id || row._id, 'reject')}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {!kyc.length && (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      No KYC submissions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <KycDocsDrawer
            row={selectedKyc}
            onClose={() => setSelectedKyc(null)}
            onReview={reviewKyc}
          />
        </div>
      )}

      {activeTab === 'deposits' && (
        <div className="admin-card">
          <h2>Deposit verification</h2>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Approve crypto (txn hash) and fiat (bank transfer + proof) deposits.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Proof</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((row) => {
                  const userLabel = row.user?.email || row.user?.mobile || String(row.userId);
                  const ref =
                    row.type === 'crypto'
                      ? `${row.network || ''} ${row.txnHash || '—'}`.trim()
                      : row.utrNumber || '—';
                  return (
                    <tr key={row.id}>
                      <td style={{ color: 'var(--adm-muted)' }}>{userLabel}</td>
                      <td className="capitalize">{row.type}</td>
                      <td>{row.amount} {row.currency || 'USDT'}</td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ref}>{ref}</td>
                      <td>
                        {row.paymentProof?.url ? (
                          <a href={row.paymentProof.url} target="_blank" rel="noreferrer" className="admin-link">
                            View proof
                          </a>
                        ) : row.type === 'crypto' && row.txnHash ? (
                          <span className="text-xs text-text-muted">On-chain</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        {row.status === 'pending' ? (
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="admin-btn admin-btn--primary admin-btn--sm"
                              onClick={() => verifyDeposit(row.id, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn--danger admin-btn--sm"
                              onClick={() => verifyDeposit(row.id, 'reject')}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!deposits.length && (
                  <tr>
                    <td colSpan={7} className="admin-empty">
                      No deposit requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'withdrawals' && (
        <div className="admin-card">
          <h2>Withdrawal verification</h2>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Approve crypto (wallet address) and fiat (bank transfer) withdrawal requests.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((row) => {
                  const userLabel = row.user?.email || row.user?.mobile || String(row.userId);
                  const dest =
                    row.type === 'crypto'
                      ? `${row.network || ''} ${row.walletAddress || '—'}`.trim()
                      : `${row.bankName || ''} · ${row.accountNumber || '—'} (${row.ifsc || ''})`.trim();
                  return (
                    <tr key={row.id}>
                      <td style={{ color: 'var(--adm-muted)' }}>{userLabel}</td>
                      <td className="capitalize">{row.type}</td>
                      <td>{row.amount} {row.currency || 'USDT'}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dest}>{dest}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        {row.status === 'pending' ? (
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="admin-btn admin-btn--primary admin-btn--sm"
                              onClick={() => verifyWithdrawal(row.id, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn--danger admin-btn--sm"
                              onClick={() => verifyWithdrawal(row.id, 'reject')}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!withdrawals.length && (
                  <tr>
                    <td colSpan={6} className="admin-empty">
                      No withdrawal requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
        <div className="admin-card">
          <h2>All Orders</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 120).map((o) => (
                  <tr key={o._id}>
                    <td style={{ color: 'var(--adm-muted)' }}>{String(o.userId)}</td>
                    <td>{o.symbol}</td>
                    <td>{o.side}</td>
                    <td>{o.orderType}</td>
                    <td>{o.quantity}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan={6} className="admin-empty">
                      No orders.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
            {msg && <p className="admin-msg">{msg}</p>}
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
    </div>
  );
}
