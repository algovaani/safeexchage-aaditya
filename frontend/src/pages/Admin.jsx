import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Admin() {
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [kyc, setKyc] = useState([]);
  const [txs, setTxs] = useState([]);
  const [allTxs, setAllTxs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [manual, setManual] = useState([]);
  const [msg, setMsg] = useState('');

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
  }

  useEffect(() => {
    refresh().catch(() => {});
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

  return (
    <div className="ex-page">
      <h1 className="h1">Admin Workspace</h1>
      <p className="muted">All user-side activities are manageable from here.</p>

      <div className="admin-tabs">
        {['overview', 'users', 'kyc', 'wallet', 'orders', 'prices'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'is-active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid-2" style={{ marginTop: '1rem' }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Summary</h2>
            <p>Users: {users.length}</p>
            <p>Pending KYC: {kyc.filter((x) => x.status === 'pending').length}</p>
            <p>Pending Transactions: {txs.length}</p>
            <p>Open Orders: {orders.filter((x) => x.status === 'open').length}</p>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Recent Trades</h2>
            <table className="table">
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
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Users ({users.length})</h2>
          <table className="table">
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
                  <td>{u.role}</td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'kyc' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>KYC Queue</h2>
          <table className="table">
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
                  <td className="muted">{String(row.userId)}</td>
                  <td>{row.documentType}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.status === 'pending' && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => approveKyc(row._id, 'approved')}>
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ marginLeft: '0.35rem' }}
                          onClick={() => approveKyc(row._id, 'rejected')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'wallet' && (
        <div className="grid-2" style={{ marginTop: '1rem' }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Pending Transactions</h2>
            <table className="table">
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
                    <td className="muted">{String(t.userId)}</td>
                    <td>{t.type}</td>
                    <td>{t.amount}</td>
                    <td>
                      <button type="button" className="btn btn-primary" onClick={() => approveTx(t._id, 'approve')}>
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ marginLeft: '0.35rem' }}
                        onClick={() => approveTx(t._id, 'reject')}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>All Transactions</h2>
            <table className="table">
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
                    <td className="muted">{String(t.userId)}</td>
                    <td>{t.type}</td>
                    <td>{t.amount}</td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>All Orders</h2>
          <table className="table">
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
                  <td className="muted">{String(o.userId)}</td>
                  <td>{o.symbol}</td>
                  <td>{o.side}</td>
                  <td>{o.orderType}</td>
                  <td>{o.quantity}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'prices' && (
        <>
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Manual Price (Merge Layer)</h2>
            <form className="grid-2" onSubmit={saveManual}>
              <div className="field">
                <label>Symbol</label>
                <input value={manualForm.symbol} onChange={(e) => setManualForm({ ...manualForm, symbol: e.target.value })} />
              </div>
              <div className="field">
                <label>Interval</label>
                <select value={manualForm.interval} onChange={(e) => setManualForm({ ...manualForm, interval: e.target.value })}>
                  <option value="1s">1s</option>
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                </select>
              </div>
              <div className="field">
                <label>Open time (ms)</label>
                <input value={manualForm.openTime} onChange={(e) => setManualForm({ ...manualForm, openTime: e.target.value })} />
              </div>
              <div className="field">
                <label>Mode</label>
                <select value={manualForm.mode} onChange={(e) => setManualForm({ ...manualForm, mode: e.target.value })}>
                  <option value="candle">candle</option>
                  <option value="tick">tick</option>
                </select>
              </div>
              <div className="field">
                <label>Open</label>
                <input value={manualForm.open} onChange={(e) => setManualForm({ ...manualForm, open: e.target.value })} />
              </div>
              <div className="field">
                <label>High</label>
                <input value={manualForm.high} onChange={(e) => setManualForm({ ...manualForm, high: e.target.value })} />
              </div>
              <div className="field">
                <label>Low</label>
                <input value={manualForm.low} onChange={(e) => setManualForm({ ...manualForm, low: e.target.value })} />
              </div>
              <div className="field">
                <label>Close</label>
                <input value={manualForm.close} onChange={(e) => setManualForm({ ...manualForm, close: e.target.value })} />
              </div>
              <div className="field">
                <label>Volume</label>
                <input value={manualForm.volume} onChange={(e) => setManualForm({ ...manualForm, volume: e.target.value })} />
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button className="btn btn-primary" type="submit">
                  Save manual candle
                </button>
              </div>
            </form>
            {msg && <p>{msg}</p>}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Manual Overrides</h2>
            <table className="table">
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
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
