import { useEffect, useMemo, useState } from 'react';
import { api, authAPI, depositAPI, parseApiResponse } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { WALLET_ASSETS } from '../theme/assets.js';
import DepositModal from '../components/DepositModal.jsx';
import WithdrawModal from '../components/WithdrawModal.jsx';
import CashInPersonModal from '../components/CashInPersonModal.jsx';
import CoinIcon from '../components/CoinIcon.jsx';
import { fmtINR, fmtUSD } from '../utils/format.js';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { useTradingPairs } from '../context/TradingPairsContext.jsx';

function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (n >= 1) return n.toFixed(6).replace(/\.?0+$/, '');
  return n.toFixed(8).replace(/\.?0+$/, '');
}

export default function Account() {
  const { user } = useAuth();
  const { toInr, usdtInrRate } = usePlatformConfig();
  const { pairs } = useTradingPairs();
  const [spotUsdt, setSpotUsdt] = useState(null);
  const [lockedUsdt, setLockedUsdt] = useState(0);
  const [assetBalances, setAssetBalances] = useState([]);
  const [priceMap, setPriceMap] = useState({});
  const [hideZero, setHideZero] = useState(true);
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

  function applyWallet(wallet) {
    if (!wallet) return;
    setSpotUsdt(wallet?.balance_usdt ?? wallet?.balance ?? 0);
    setLockedUsdt(wallet?.locked_balance ?? 0);
    if (Array.isArray(wallet?.assets)) {
      setAssetBalances(wallet.assets);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const [{ data: balRes }, { data: priceRes }] = await Promise.all([
        api.get('/wallet/balance'),
        api.get('/market/prices/live').catch(() => ({ data: null })),
      ]);
      applyWallet(parseApiResponse(balRes));

      const live = parseApiResponse(priceRes);
      const pairsLive = Array.isArray(live?.pairs) ? live.pairs : [];
      const next = {};
      for (const row of pairsLive) {
        const sym = String(row.symbol || '').toUpperCase();
        const base = sym.replace(/USDT$|INR$/i, '');
        const price = Number(row.price ?? row.lastPrice ?? 0);
        if (!base || !(price > 0)) continue;
        // Prefer USDT pair for valuation when both exist
        if (sym.endsWith('USDT') || !next[base]) next[base] = { price, quote: sym.endsWith('INR') ? 'INR' : 'USDT' };
      }
      setPriceMap(next);
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
      applyWallet(e.detail);
    };
    window.addEventListener('wallet:updated', onWallet);
    return () => window.removeEventListener('wallet:updated', onWallet);
  }, []);

  const pairMetaByBase = useMemo(() => {
    const map = new Map();
    for (const p of pairs || []) {
      const base = String(p.baseAsset || p.symbol || '').replace(/USDT$|INR$/i, '').toUpperCase();
      if (base && !map.has(base)) map.set(base, p);
    }
    return map;
  }, [pairs]);

  const rows = useMemo(() => {
    const byAsset = new Map(
      (assetBalances || []).map((a) => [String(a.asset || '').toUpperCase(), a])
    );

    const symbols = new Set([
      'USDT',
      ...WALLET_ASSETS.map((a) => a.symbol),
      ...byAsset.keys(),
    ]);

    return [...symbols].map((symbol) => {
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

      return {
        symbol,
        name: meta?.name || symbol,
        imageUrl: meta?.imageUrl,
        coingeckoId: meta?.coingeckoId,
        type: meta?.category === 'commodity' ? 'commodity' : 'crypto',
        qty,
        available,
        locked,
        usdtValue,
        canDeposit: WALLET_ASSETS.some((a) => a.symbol === symbol) || isUsdt,
      };
    }).sort((a, b) => {
      if (a.symbol === 'USDT') return -1;
      if (b.symbol === 'USDT') return 1;
      return (b.qty || 0) - (a.qty || 0) || a.symbol.localeCompare(b.symbol);
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
            {loading ? '…' : fmtINR(toInr(portfolioUsdt))}
          </p>
          <p className="text-sm text-text-muted mt-1">
            ≈ {fmtUSD(portfolioUsdt)} USDT
          </p>
          {!loading && lockedUsdt > 0 && (
            <p className="text-xs text-text-secondary mt-1">
              Available USDT: {fmtINR(toInr(availableUsdt))} · Locked: {fmtINR(toInr(lockedUsdt))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 wallet-action-row">
          <button type="button" className="btn-primary" onClick={() => onDeposit('USDT')}>
            Deposit
          </button>
          <button type="button" className="btn-secondary" onClick={() => onWithdraw('USDT')}>
            Withdraw
          </button>
          <button type="button" className="btn-cash-in-person" onClick={() => setCashInPersonOpen(true)}>
            Cash in Person
          </button>
        </div>
      </div>
      <div className="ui-card p-0 overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Assets</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Purchased coin balances · {visible.length} asset{visible.length !== 1 ? 's' : ''} shown
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
                    {loading ? 'Loading balances…' : 'No purchased coins yet. Buy on Trade to see holdings here.'}
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
          availableBalance={availableUsdt}
          onClose={() => setWithdrawCoin(null)}
          onSuccess={refresh}
        />
      )}

      {cashInPersonOpen && (
        <CashInPersonModal
          userMobile={user?.mobile || ''}
          onClose={() => setCashInPersonOpen(false)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
