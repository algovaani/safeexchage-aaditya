import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { WALLET_ASSETS } from '../theme/assets.js';
import './Account.css';

export default function Account() {
  const { user } = useAuth();
  const [spotUsdt, setSpotUsdt] = useState(null);
  const [hideZero, setHideZero] = useState(false);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await api.get('/wallet/balance');
      setSpotUsdt(data.balance ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    return WALLET_ASSETS.map((a) => {
      const isUsdt = a.symbol === 'USDT';
      const main = 0;
      const spot = isUsdt ? Number(spotUsdt ?? 0) : 0;
      return { ...a, main, spot, total: main + spot };
    });
  }, [spotUsdt]);

  const visible = useMemo(() => {
    let list = rows;
    if (hideZero) list = list.filter((r) => r.main !== 0 || r.spot !== 0);
    const q = search.trim().toUpperCase();
    if (q) list = list.filter((r) => r.symbol.includes(q));
    return list;
  }, [rows, hideZero, search]);

  async function deposit(e) {
    e.preventDefault();
    setMsg('');
    const a = parseFloat(amount);
    if (!(a > 0)) return;
    await api.post('/wallet/deposit', { amount: a, reference: ref });
    setAmount('');
    setRef('');
    setMsg('Deposit request submitted (pending admin approval).');
    await refresh();
  }

  async function withdraw(e) {
    e.preventDefault();
    setMsg('');
    const a = parseFloat(amount);
    if (!(a > 0)) return;
    await api.post('/wallet/withdraw', { amount: a });
    setAmount('');
    setMsg('Withdrawal request submitted (pending admin approval).');
    await refresh();
  }

  function scrollToUsdt() {
    document.getElementById('account-usdt-actions')?.scrollIntoView({ behavior: 'smooth' });
  }

  function onAction(asset, action) {
    if (asset !== 'USDT') {
      setMsg(`${action} for ${asset} is not enabled in this demo (USDT only).`);
      return;
    }
    scrollToUsdt();
  }

  const portfolio = spotUsdt != null ? Number(spotUsdt) : null;
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Trader';

  return (
    <div className="account-page">
      <section className="account-hero">
        <div className="account-hero__left">
          <p className="account-hero__eyebrow">Welcome back, {displayName}</p>
          <h1 className="account-hero__title">My Wallet</h1>
          <p className="account-hero__sub">Manage balances, deposits, and withdrawals in one place.</p>
        </div>
        <div className="account-hero__balance">
          <span className="account-hero__balance-label">Total portfolio (USDT)</span>
          <strong className="account-hero__balance-value">
            {loading ? '…' : portfolio != null ? portfolio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </strong>
          <span className="account-hero__balance-note">SPOT wallet · demo balance</span>
        </div>
      </section>

      <section className="account-quick">
        <button type="button" className="account-quick__card" onClick={scrollToUsdt}>
          <span className="account-quick__icon">↓</span>
          <span className="account-quick__label">Deposit</span>
        </button>
        <button type="button" className="account-quick__card" onClick={scrollToUsdt}>
          <span className="account-quick__icon">↑</span>
          <span className="account-quick__label">Withdraw</span>
        </button>
        <Link to="/transactions" className="account-quick__card">
          <span className="account-quick__icon">⇄</span>
          <span className="account-quick__label">History</span>
        </Link>
        <Link to="/account/profile" className="account-quick__card">
          <span className="account-quick__icon">◎</span>
          <span className="account-quick__label">Profile & KYC</span>
        </Link>
      </section>

      <section className="account-card">
        <div className="account-card__head">
          <div>
            <h2>Assets</h2>
            <p>{visible.length} asset{visible.length !== 1 ? 's' : ''} shown</p>
          </div>
          <div className="account-toolbar">
            <input
              className="account-search"
              type="search"
              placeholder="Search coin…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="account-toggle">
              <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
              Hide zero balances
            </label>
          </div>
        </div>

        <div className="account-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Main wallet</th>
                <th>SPOT wallet</th>
                <th>Total</th>
                <th className="account-table__actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.symbol} className={r.symbol === 'USDT' ? 'is-highlight' : ''}>
                  <td>
                    <span className="account-coin">
                      <span className="account-coin__icon" style={{ background: r.color }}>
                        {r.symbol.slice(0, 2)}
                      </span>
                      <span>
                        <strong>{r.symbol}</strong>
                        {r.symbol === 'USDT' && <small>Primary</small>}
                      </span>
                    </span>
                  </td>
                  <td>{r.main.toFixed(8)}</td>
                  <td>{r.spot.toFixed(8)}</td>
                  <td className="account-table__total">{r.total.toFixed(8)}</td>
                  <td>
                    <div className="account-row-actions">
                      <button type="button" className="account-action-btn" onClick={() => onAction(r.symbol, 'Deposit')}>
                        Deposit
                      </button>
                      <button type="button" className="account-action-btn" onClick={() => onAction(r.symbol, 'Withdrawal')}>
                        Withdraw
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={5} className="account-empty">
                    No assets match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="account-usdt-actions" className="account-funds">
        <div className="account-funds__card account-funds__card--deposit">
          <h3>Deposit USDT</h3>
          <p>Add funds to your SPOT wallet. Admin approval may apply.</p>
          <form onSubmit={deposit}>
            <div className="account-field">
              <label>Amount (USDT)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" placeholder="0.00" />
            </div>
            <div className="account-field">
              <label>Reference (optional)</label>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank ref / note" />
            </div>
            <button className="account-submit account-submit--deposit" type="submit">
              Submit deposit
            </button>
          </form>
        </div>

        <div className="account-funds__card account-funds__card--withdraw">
          <h3>Withdraw USDT</h3>
          <p>Request a withdrawal from your available SPOT balance.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              withdraw(e);
            }}
          >
            <div className="account-field">
              <label>Amount (USDT)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" placeholder="0.00" />
            </div>
            <div className="account-field">
              <label>Available</label>
              <input readOnly value={portfolio != null ? `${portfolio.toFixed(2)} USDT` : '—'} />
            </div>
            <button className="account-submit account-submit--withdraw" type="submit">
              Submit withdrawal
            </button>
          </form>
        </div>
      </section>

      {msg && <p className="account-msg">{msg}</p>}
    </div>
  );
}
