import { useEffect, useMemo, useState } from 'react';
import { api, authAPI, depositAPI, parseApiResponse } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { WALLET_ASSETS } from '../theme/assets.js';
import DepositModal from '../components/DepositModal.jsx';
import WithdrawModal from '../components/WithdrawModal.jsx';
import { fmtINR, fmtUSD, inrFromUsdt } from '../utils/format.js';

export default function Account() {
  const { user } = useAuth();
  const [spotUsdt, setSpotUsdt] = useState(null);
  const [lockedUsdt, setLockedUsdt] = useState(0);
  const [hideZero, setHideZero] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [depositCoin, setDepositCoin] = useState(null);
  const [withdrawCoin, setWithdrawCoin] = useState(null);
  const [platformInfo, setPlatformInfo] = useState(null);
  const [walletForm, setWalletForm] = useState({
    bnbWalletAddress: '',
    ethWalletAddress: '',
    trcWalletAddress: '',
    usdtWalletAddress: '',
  });
  const [walletBusy, setWalletBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await api.get('/wallet/balance');
      const wallet = parseApiResponse(data);
      setSpotUsdt(wallet?.balance_usdt ?? wallet?.balance ?? 0);
      setLockedUsdt(wallet?.locked_balance ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
    depositAPI
      .getPlatformInfo()
      .then(setPlatformInfo)
      .catch(() => setPlatformInfo(null));
    authAPI
      .me()
      .then((profile) => {
        setWalletForm({
          bnbWalletAddress: profile?.bnbWalletAddress || '',
          ethWalletAddress: profile?.ethWalletAddress || '',
          trcWalletAddress: profile?.trcWalletAddress || '',
          usdtWalletAddress: profile?.usdtWalletAddress || '',
        });
      })
      .catch(() => {});
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 20_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onWallet = (e) => {
      const w = e.detail;
      if (!w) return;
      setSpotUsdt(w.balance_usdt ?? w.balance ?? 0);
      setLockedUsdt(w.locked_balance ?? 0);
    };
    window.addEventListener('wallet:updated', onWallet);
    return () => window.removeEventListener('wallet:updated', onWallet);
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

  function onDeposit(symbol) {
    setDepositCoin(symbol);
  }

  function onWithdraw(symbol) {
    setWithdrawCoin(symbol);
  }

  async function saveWalletAddresses(e) {
    e.preventDefault();
    setWalletBusy(true);
    setMsg('');
    try {
      await authAPI.updateProfile(walletForm);
      setMsg('Wallet addresses saved.');
    } catch (ex) {
      setMsg(ex.message || 'Failed to save wallet addresses');
    } finally {
      setWalletBusy(false);
    }
  }

  const portfolio = spotUsdt != null ? Number(spotUsdt) : null;
  const available = Math.max(0, (portfolio ?? 0) - Number(lockedUsdt || 0));

  return (
    <div className="space-y-8">
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
          {!loading && lockedUsdt > 0 && (
            <p className="text-xs text-text-secondary mt-1">
              Available: {available.toFixed(2)} USDT · Locked: {Number(lockedUsdt).toFixed(2)} USDT
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn-primary" onClick={() => onDeposit('USDT')}>
            Deposit
          </button>
          <button type="button" className="btn-secondary" onClick={() => onWithdraw('USDT')}>
            Withdraw
          </button>
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
                      <button type="button" className="text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer p-0" onClick={() => onDeposit(r.symbol)}>Deposit</button>
                      <button type="button" className="text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer p-0" onClick={() => onWithdraw(r.symbol)}>Withdraw</button>
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

      <div className="ui-card space-y-4">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Your wallet addresses</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Used when you submit deposits — auto-filled in the deposit form.
          </p>
        </div>
        <form onSubmit={saveWalletAddresses} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="ui-label">BNB address</label>
            <input className="ui-input" value={walletForm.bnbWalletAddress} onChange={(e) => setWalletForm((f) => ({ ...f, bnbWalletAddress: e.target.value }))} placeholder="0x…" />
          </div>
          <div>
            <label className="ui-label">ETH address</label>
            <input className="ui-input" value={walletForm.ethWalletAddress} onChange={(e) => setWalletForm((f) => ({ ...f, ethWalletAddress: e.target.value }))} placeholder="0x…" />
          </div>
          <div>
            <label className="ui-label">TRX / TRON address</label>
            <input className="ui-input" value={walletForm.trcWalletAddress} onChange={(e) => setWalletForm((f) => ({ ...f, trcWalletAddress: e.target.value }))} placeholder="T…" />
          </div>
          <div>
            <label className="ui-label">USDT address</label>
            <input className="ui-input" value={walletForm.usdtWalletAddress} onChange={(e) => setWalletForm((f) => ({ ...f, usdtWalletAddress: e.target.value }))} placeholder="Your USDT wallet" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-secondary" disabled={walletBusy}>
              {walletBusy ? 'Saving…' : 'Save wallet addresses'}
            </button>
          </div>
        </form>
      </div>

      {msg && (
        <p className="text-sm text-profit bg-profit/10 border border-profit/20 rounded-xl px-4 py-3">{msg}</p>
      )}

      {depositCoin && (
        <DepositModal
          coin={depositCoin}
          platformInfo={platformInfo}
          onClose={() => setDepositCoin(null)}
          onSuccess={refresh}
        />
      )}

      {withdrawCoin && (
        <WithdrawModal
          coin={withdrawCoin}
          platformInfo={platformInfo}
          availableBalance={available}
          onClose={() => setWithdrawCoin(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
