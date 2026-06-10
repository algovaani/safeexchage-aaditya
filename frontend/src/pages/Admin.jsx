import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import './Admin.css';

const SECTION_TITLES = {
  overview: 'Overview',
  users: 'Users',
  kyc: 'KYC Review',
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
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

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
      pendingTx: txs.length,
      openOrders: orders.filter((x) => x.status === 'open').length,
    }),
    [users, kyc, txs, orders]
  );

  async function refresh() {
    setLoading(true);
    try {
      const [{ data: u }, { data: k }, { data: t }, { data: tr }, { data: m }, { data: allT }, { data: allO }] =
        await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/kyc'),
          api.get('/admin/transactions'),
          api.get('/admin/trades'),
          api.get('/admin/manual-prices'),
          api.get('/admin/transactions/all'),
          api.get('/admin/orders'),
        ]);
      setUsers(u);
      setKyc(k);
      setTxs(t);
      setTrades(tr);
      setManual(m);
      setAllTxs(allT);
      setOrders(allO);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function approveKyc(id, status) {
    await api.patch(`/admin/kyc/${id}`, { status, adminNote: '' });
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
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {kyc.map((row) => (
                  <tr key={row._id}>
                    <td style={{ color: 'var(--adm-muted)' }}>{String(row.userId)}</td>
                    <td>{row.documentType}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      {row.status === 'pending' && (
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--primary admin-btn--sm"
                            onClick={() => approveKyc(row._id, 'approved')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger admin-btn--sm"
                            onClick={() => approveKyc(row._id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!kyc.length && (
                  <tr>
                    <td colSpan={4} className="admin-empty">
                      No KYC submissions.
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
