import { useEffect, useMemo, useState } from 'react';
import { api, parseApiResponse } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { WALLET_ASSETS } from '../theme/assets.js';
import Input from '../components/ui/Input.jsx';
import { fmtINR, fmtUSD, inrFromUsdt } from '../utils/format.js';
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
      const wallet = parseApiResponse(data);
      setSpotUsdt(wallet?.balance_usdt ?? wallet?.balance ?? 0);
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

  return (    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium text-text-primary mb-1">Wallet</h1>
        <p className="text-sm text-text-secondary">Manage funds, deposits, and withdrawals</p>
      </div>

      <div className="ui-card flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <p className="stat-card__label">Total Balance</p>
          <p className="text-3xl font-medium tabular-nums text-text-primary mt-1">
            {loading ? '…' : fmtINR(inrFromUsdt(portfolio ?? 0))}
          </p>
          <p className="text-sm text-text-muted mt-1">
            ≈ {portfolio != null ? fmtUSD(portfolio) : '—'} USD
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn-primary" onClick={scrollToUsdt}>Deposit</button>
          <button type="button" className="btn-secondary" onClick={scrollToUsdt}>Withdraw</button>
        </div>
      </div>
      <div className="ui-card p-0 overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Assets</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {visible.length} asset{visible.length !== 1 ? 's' : ''} shown
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="ui-input !w-auto min-w-[180px]"
              type="search"
              placeholder="Search coin…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={hideZero}
                onChange={(e) => setHideZero(e.target.checked)}
                className="rounded border-border accent-accent"
              />
              Hide zero balances
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Total Balance</th>
                <th>Available</th>
                <th>In Orders</th>
                <th>INR Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.symbol}
                  className={`border-b border-border/50 hover:bg-bg-tertiary/20 transition-colors ${
                    r.symbol === 'USDT' ? 'bg-accent/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ background: r.color }}
                      >
                        {r.symbol.slice(0, 2)}
                      </span>
                      <span>
                        <strong className="text-text-primary">{r.symbol}</strong>
                        {r.symbol === 'USDT' && (
                          <small className="block text-xs text-accent">Primary</small>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="tabular-nums">{r.total.toFixed(8)}</td>
                  <td className="tabular-nums">{r.spot.toFixed(8)}</td>
                  <td className="tabular-nums text-text-muted">0</td>
                  <td className="tabular-nums">
                    {r.symbol === 'USDT' ? fmtINR(inrFromUsdt(r.total)) : '—'}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer p-0" onClick={() => onAction(r.symbol, 'Deposit')}>Deposit</button>
                      <button type="button" className="text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer p-0" onClick={() => onAction(r.symbol, 'Withdrawal')}>Withdraw</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-text-secondary">
                    No assets match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="account-usdt-actions" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="ui-card">
          <h3 className="text-base font-semibold text-text-primary mb-1">Deposit USDT</h3>
          <p className="text-sm text-text-secondary mb-5">Add funds to your SPOT wallet. Admin approval may apply.</p>
          <form onSubmit={deposit} className="space-y-4">
            <Input
              label="Amount (USDT)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              step="any"
              placeholder="0.00"
            />
            <Input
              label="Reference (optional)"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Bank ref / note"
            />
            <button type="submit" className="btn-primary w-full">Submit deposit</button>
          </form>
        </div>

        <div className="ui-card">
          <h3 className="text-sm font-medium text-text-primary mb-1">Withdraw USDT</h3>
          <p className="text-sm text-text-secondary mb-5">Request a withdrawal from your available SPOT balance.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              withdraw(e);
            }}
            className="space-y-4"
          >
            <Input
              label="Amount (USDT)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              step="any"
              placeholder="0.00"
            />
            <Input
              label="Available"
              readOnly
              value={portfolio != null ? `${portfolio.toFixed(2)} USDT` : '—'}
            />
            <button type="submit" className="btn-danger w-full">Submit withdrawal</button>
          </form>
        </div>
      </div>

      {msg && (
        <p className="text-sm text-profit bg-profit/10 border border-profit/20 rounded-xl px-4 py-3">{msg}</p>
      )}
    </div>
  );
}
