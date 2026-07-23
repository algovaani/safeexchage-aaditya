import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, authAPI, depositAPI, parseApiResponse, withdrawalAPI } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import DepositModal from '../components/DepositModal.jsx';
import WithdrawModal from '../components/WithdrawModal.jsx';
import CashInPersonModal from '../components/CashInPersonModal.jsx';
import CoinIcon from '../components/CoinIcon.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { fmtINR, fmtUSD } from '../utils/format.js';
import { isCryptoDepositSupported } from '../config/cryptoDepositChains.js';
import { FIAT_DEPOSIT_SYMBOLS } from '../config/depositNetworks.js';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { useTradingPairs } from '../context/TradingPairsContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';

function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (n >= 1) return n.toFixed(6).replace(/\.?0+$/, '');
  return n.toFixed(8).replace(/\.?0+$/, '');
}

function buildPriceMap(live) {
  const pairsLive = Array.isArray(live?.pairs) ? live.pairs : [];
  const next = {};
  for (const row of pairsLive) {
    const sym = String(row.symbol || '').toUpperCase();
    const base = sym.replace(/USDT$|INR$/i, '');
    const price = Number(row.price ?? row.lastPrice ?? 0);
    if (!base || !(price > 0)) continue;
    // Prefer USDT pair for valuation when both exist
    if (sym.endsWith('USDT') || !next[base]) {
      next[base] = { price, quote: sym.endsWith('INR') ? 'INR' : 'USDT' };
    }
  }
  return next;
}

export default function Account() {
  const { user } = useAuth();
  const { wallet: liveWallet, walletVersion } = useRealtime();
  const { toInr, usdtInrRate } = usePlatformConfig();
  const { pairs } = useTradingPairs();
  const [spotUsdt, setSpotUsdt] = useState(null);
  const [lockedUsdt, setLockedUsdt] = useState(0);
  const [bonusUsdt, setBonusUsdt] = useState(0);
  const [withdrawableUsdt, setWithdrawableUsdt] = useState(0);
  const [assetBalances, setAssetBalances] = useState([]);
  const [priceMap, setPriceMap] = useState({});
  const [hideZero, setHideZero] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [depositCoin, setDepositCoin] = useState(null);
  const [withdrawCoin, setWithdrawCoin] = useState(null);
  const [cashInPersonOpen, setCashInPersonOpen] = useState(false);
  const [platformInfo, setPlatformInfo] = useState(null);
  const [walletForm, setWalletForm] = useState({
    bnbWalletAddress: '',
    ethWalletAddress: '',
    trcWalletAddress: '',
    usdtWalletAddress: '',
  });
  const [walletBusy, setWalletBusy] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);
  const [cancelBusyId, setCancelBusyId] = useState(null);
  const toast = useToast();
  const dialog = useDialog();

  const applyWallet = useCallback((wallet) => {
    if (!wallet) return;
    const balance = Number(wallet?.balance_usdt ?? wallet?.balance ?? 0);
    const locked = Number(wallet?.locked_balance ?? 0);
    const bonus = Number(wallet?.bonus_balance ?? 0);
    const withdrawable =
      wallet?.withdrawable_balance != null
        ? Number(wallet.withdrawable_balance)
        : Math.max(0, balance - locked - bonus);
    setSpotUsdt(balance);
    setLockedUsdt(locked);
    setBonusUsdt(bonus);
    setWithdrawableUsdt(withdrawable);
    if (Array.isArray(wallet?.assets)) {
      setAssetBalances(wallet.assets);
    }
    setLoading(false);
  }, []);

  const refreshPrices = useCallback(async () => {
    try {
      const { data } = await api.get('/market/prices/live');
      setPriceMap(buildPriceMap(parseApiResponse(data)));
    } catch {
      /* keep last known prices — never block balances */
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const { data } = await api.get('/wallet/balance');
      applyWallet(parseApiResponse(data));
    } catch {
      setLoading(false);
    }
  }, [applyWallet]);

  const refreshWithdrawals = useCallback(async () => {
    try {
      const rows = await withdrawalAPI.getHistory();
      setWithdrawals(Array.isArray(rows) ? rows : []);
    } catch {
      setWithdrawals([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    // Balance and prices must not share one Promise.all — slow/hung prices
    // previously blocked Total Balance from ever rendering.
    await Promise.all([refreshBalance(), refreshPrices(), refreshWithdrawals()]);
  }, [refreshBalance, refreshPrices, refreshWithdrawals]);

  async function cancelPendingWithdrawal(row) {
    const ok = await dialog.confirm({
      title: 'Cancel withdrawal?',
      message: `Cancel pending withdrawal of ${row.amount} ${row.currency || 'USDT'}? Locked funds will be released.`,
      confirmLabel: 'Cancel withdrawal',
      cancelLabel: 'Keep pending',
    });
    if (!ok) return;
    setCancelBusyId(row.id);
    try {
      await withdrawalAPI.cancel(row.id);
      toast.success('Withdrawal cancelled');
      await refresh();
    } catch (ex) {
      toast.error(ex.message || 'Failed to cancel withdrawal');
    } finally {
      setCancelBusyId(null);
    }
  }

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((w) => String(w.status).toLowerCase() === 'pending'),
    [withdrawals]
  );

  // Seed from realtime wallet (same source as navbar / transactions layout)
  useEffect(() => {
    if (liveWallet) applyWallet(liveWallet);
  }, [liveWallet, walletVersion, applyWallet]);

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
  }, [refresh]);

  useEffect(() => {
    const onWallet = (e) => {
      applyWallet(e.detail);
    };
    window.addEventListener('wallet:updated', onWallet);
    return () => window.removeEventListener('wallet:updated', onWallet);
  }, [applyWallet]);

  const pairMetaByBase = useMemo(() => {
    const map = new Map();
    for (const p of pairs || []) {
      if (p.isActive === false) continue;
      const base = String(p.baseAsset || p.symbol || '')
        .replace(/USDT$|INR$/i, '')
        .toUpperCase();
      if (!base) continue;
      const existing = map.get(base);
      // Prefer USDT-quoted pair for wallet row meta
      if (!existing || (p.quoteAsset === 'USDT' && existing.quoteAsset !== 'USDT')) {
        map.set(base, p);
      }
    }
    return map;
  }, [pairs]);

  const rows = useMemo(() => {
    const byAsset = new Map(
      (assetBalances || []).map((a) => [String(a.asset || '').toUpperCase(), a])
    );

    // Dynamic list: USDT + every active exchange coin + any held balance assets (exclude INR)
    const symbols = new Set(['USDT']);
    for (const base of pairMetaByBase.keys()) {
      if (base === 'INR') continue;
      symbols.add(base);
    }
    for (const asset of byAsset.keys()) {
      if (!asset || asset === 'INR') continue;
      symbols.add(asset);
    }

    return [...symbols]
      .map((symbol) => {
        const isUsdt = symbol === 'USDT';
        const held = byAsset.get(symbol);
        const qty = isUsdt ? Number(spotUsdt ?? 0) : Number(held?.balance ?? 0);
        const locked = isUsdt ? Number(lockedUsdt ?? 0) : Number(held?.locked_balance ?? 0);
        const available = Math.max(0, qty - locked);
        const meta = pairMetaByBase.get(symbol);
        const px = priceMap[symbol];
        let usdtValue = null;
        if (isUsdt) {
          usdtValue = qty;
        } else if (px?.price > 0) {
          if (px.quote === 'INR') {
            const rate = Number(usdtInrRate) > 0 ? Number(usdtInrRate) : 83.5;
            usdtValue = (qty * px.price) / rate;
          } else {
            usdtValue = qty * px.price;
          }
        }

        const isFiat = FIAT_DEPOSIT_SYMBOLS?.has?.(symbol) || symbol === 'INR';
        const canDeposit =
          isUsdt ||
          isFiat ||
          isCryptoDepositSupported(symbol, meta) ||
          (meta?.depositEnabled !== false &&
            (Boolean(meta?.depositWalletAddress) || Boolean(meta?.depositNetwork)));

        return {
          symbol,
          name: meta?.name || symbol,
          imageUrl: meta?.imageUrl,
          coingeckoId: meta?.coingeckoId,
          type: meta?.category === 'commodity' || isFiat ? 'commodity' : 'crypto',
          sortOrder: meta?.sortOrder ?? 999,
          qty,
          available,
          locked,
          usdtValue,
          canDeposit,
        };
      })
      .sort((a, b) => {
        if (a.symbol === 'USDT') return -1;
        if (b.symbol === 'USDT') return 1;
        if ((b.qty || 0) !== (a.qty || 0)) return (b.qty || 0) - (a.qty || 0);
        if ((a.sortOrder ?? 999) !== (b.sortOrder ?? 999)) {
          return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
        }
        return a.symbol.localeCompare(b.symbol);
      });
  }, [assetBalances, spotUsdt, lockedUsdt, pairMetaByBase, priceMap, usdtInrRate]);

  const visible = useMemo(() => {
    let list = rows;
    if (hideZero) list = list.filter((r) => r.qty > 0 || r.symbol === 'USDT');
    const q = search.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (r) => r.symbol.includes(q) || String(r.name || '').toUpperCase().includes(q)
      );
    }
    return list;
  }, [rows, hideZero, search]);

  const portfolioUsdt = useMemo(() => {
    const fromAssets = rows.reduce((sum, r) => {
      if (r.symbol === 'USDT') return sum;
      return sum + (Number(r.usdtValue) || 0);
    }, 0);
    return Number(spotUsdt ?? 0) + fromAssets;
  }, [rows, spotUsdt]);

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

  const availableUsdt = Math.max(0, Number(spotUsdt ?? 0) - Number(lockedUsdt || 0));
  const withdrawableBalance = Math.max(0, Number(withdrawableUsdt ?? availableUsdt - bonusUsdt));

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
            {loading && spotUsdt == null ? '…' : fmtINR(toInr(portfolioUsdt))}
          </p>
          <p className="text-sm text-text-muted mt-1">
            ≈ {fmtUSD(portfolioUsdt)} USDT
          </p>
          {!loading && (lockedUsdt > 0 || bonusUsdt > 0) && (
            <p className="text-xs text-text-secondary mt-1">
              {lockedUsdt > 0 && (
                <>
                  Available USDT: {fmtINR(toInr(availableUsdt))} · Locked: {fmtINR(toInr(lockedUsdt))}
                </>
              )}
              {bonusUsdt > 0 && (
                <>
                  {lockedUsdt > 0 ? ' · ' : ''}
                  Referral bonus: {fmtINR(toInr(bonusUsdt))} (trading only)
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 wallet-action-row">
          <button type="button" className="btn-primary" onClick={() => onDeposit('USDT')}>
            Deposit
          </button>
          <button type="button" className="btn-outline-accent" onClick={() => onWithdraw('USDT')}>
            Withdraw
          </button>
          <button type="button" className="btn-cash-in-person" onClick={() => setCashInPersonOpen(true)}>
            Cash in Person
          </button>
        </div>
      </div>

      {pendingWithdrawals.length > 0 && (
        <div className="ui-card p-0 overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="text-sm font-medium text-text-primary">Pending withdrawals</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Cancel a request before admin approval to unlock your funds
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingWithdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="tabular-nums">
                      {w.amount} {w.currency || 'USDT'}
                    </td>
                    <td className="capitalize">{w.type}</td>
                    <td className="text-xs text-text-secondary max-w-[220px] truncate">
                      {w.type === 'crypto'
                        ? `${w.network || ''} · ${w.walletAddress || '—'}`
                        : `${w.bankName || ''} · ${w.accountNumber || '—'}`}
                    </td>
                    <td>
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="text-xs text-text-secondary tabular-nums">
                      {w.createdAt || w.submittedAt
                        ? new Date(w.createdAt || w.submittedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-xs text-loss hover:underline bg-transparent border-0 cursor-pointer p-0 disabled:opacity-50"
                        disabled={cancelBusyId === w.id}
                        onClick={() => cancelPendingWithdrawal(w)}
                      >
                        {cancelBusyId === w.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="ui-card p-0 overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Assets</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              All exchange coins · {visible.length} of {rows.length} shown
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
                <th>Coins held</th>
                <th>Available</th>
                <th>In Orders</th>
                <th>Est. value</th>
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
                      <CoinIcon
                        symbol={r.symbol}
                        imageUrl={r.imageUrl}
                        coingeckoId={r.coingeckoId}
                        type={r.type}
                        name={r.name}
                        size={28}
                      />
                      <span>
                        <strong className="text-text-primary">{r.symbol}</strong>
                        <small className="block text-xs text-text-muted">
                          {r.symbol === 'USDT' ? 'Primary balance' : r.name}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td className="tabular-nums">
                    <strong>{fmtQty(r.qty)}</strong>
                    <span className="text-text-muted text-xs ml-1">{r.symbol}</span>
                  </td>
                  <td className="tabular-nums">{fmtQty(r.available)}</td>
                  <td className="tabular-nums text-text-muted">{fmtQty(r.locked)}</td>
                  <td className="tabular-nums">
                    {r.usdtValue != null ? (
                      <>
                        <div>{fmtINR(toInr(r.usdtValue))}</div>
                        <div className="text-xs text-text-muted">≈ {fmtUSD(r.usdtValue)}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-3">
                      {r.canDeposit || r.symbol === 'USDT' ? (
                        <>
                          <button
                            type="button"
                            className="text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer p-0"
                            onClick={() => onDeposit(r.symbol === 'USDT' ? 'USDT' : r.symbol)}
                          >
                            Deposit
                          </button>
                          {r.symbol === 'USDT' && (
                            <button
                              type="button"
                              className="text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer p-0"
                              onClick={() => onWithdraw('USDT')}
                            >
                              Withdraw
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-text-muted">Spot holdings</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-text-secondary">
                    {loading
                      ? 'Loading balances…'
                      : search.trim()
                        ? 'No coins match your search.'
                        : hideZero
                          ? 'No balances yet. Uncheck “Hide zero balances” to see all coins.'
                          : 'No coins listed yet. Add coins from Admin → Exchange Coins.'}
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
          availableBalance={withdrawableBalance}
          onClose={() => setWithdrawCoin(null)}
          onSuccess={refresh}
        />
      )}

      {cashInPersonOpen && (
        <CashInPersonModal
          userMobile={user?.mobile || ''}
          platformInfo={platformInfo}
          onClose={() => setCashInPersonOpen(false)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
