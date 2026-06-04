import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { WALLET_ASSETS } from '../theme/assets.js';

export default function Account() {
  const [spotUsdt, setSpotUsdt] = useState(null);
  const [hideZero, setHideZero] = useState(false);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState('');

  async function refresh() {
    const { data } = await api.get('/wallet/balance');
    setSpotUsdt(data.balance ?? 0);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const rows = useMemo(() => {
    return WALLET_ASSETS.map((a) => {
      const isUsdt = a.symbol === 'USDT';
      const main = 0;
      const spot = isUsdt ? Number(spotUsdt ?? 0) : 0;
      return { ...a, main, spot };
    });
  }, [spotUsdt]);

  const visible = useMemo(() => {
    if (!hideZero) return rows;
    return rows.filter((r) => r.main !== 0 || r.spot !== 0);
  }, [rows, hideZero]);

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

  function onAction(asset, action) {
    if (asset !== 'USDT') {
      setMsg(`${action} for ${asset} is not enabled in this demo (USDT only).`);
      return;
    }
    document.getElementById('account-usdt-actions')?.scrollIntoView({ behavior: 'smooth' });
  }

  const portfolio = spotUsdt != null ? Number(spotUsdt).toFixed(2) : '—';

  return (
    <div className="ex-page">
      <div className="ex-page__toolbar">
        <label className="ex-check">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Hide zero balances wallet
        </label>
        <span className="ex-page__portfolio">Portfolio : {portfolio} USDT</span>
      </div>

      <div className="ex-table-wrap">
        <table className="ex-asset-table">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Main - Wallet</th>
              <th>SPOT - Wallet</th>
              <th className="ex-asset-table__actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.symbol}>
                <td>
                  <span className="ex-coin">
                    <span className="ex-coin__icon" style={{ background: r.color }}>
                      {r.symbol.slice(0, 2)}
                    </span>
                    {r.symbol}
                  </span>
                </td>
                <td>{r.main.toFixed(8)}</td>
                <td>{r.spot.toFixed(8)}</td>
                <td>
                  <div className="ex-row-btns">
                    <button type="button" className="ex-pill-btn" onClick={() => onAction(r.symbol, 'Deposit')}>
                      Deposit
                    </button>
                    <button type="button" className="ex-pill-btn" onClick={() => onAction(r.symbol, 'Withdrawal')}>
                      Withdrawal
                    </button>
                    <button type="button" className="ex-pill-btn" onClick={() => onAction(r.symbol, 'Transfer')}>
                      Transfer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ex-page__hint">
        Manage profile &amp; KYC:{' '}
        <Link to="/account/profile">Account profile</Link>
      </p>

      <div id="account-usdt-actions" className="ex-panel-light ex-usdt-panel">
        <h2 className="ex-panel-light__title">USDT — Deposit / Withdraw</h2>
        <p className="ex-muted">Demo wallet credits USDT to your SPOT balance. Requests may require admin approval.</p>
        <form className="ex-form-row" onSubmit={deposit}>
          <div className="field">
            <label>Amount (USDT)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" />
          </div>
          <div className="field">
            <label>Reference (optional)</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit">
            Deposit
          </button>
          <button type="button" className="btn btn-secondary" onClick={withdraw}>
            Withdrawal
          </button>
        </form>
        {msg && <p className="ex-msg">{msg}</p>}
      </div>
    </div>
  );
}
