import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Inbox } from 'lucide-react';
import { api, dashboardAPI, parseApiResponse } from '../api/client.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { fmtINR, fmtUSD, fmtPct } from '../utils/format.js';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { useTradingPairs } from '../context/TradingPairsContext.jsx';
import { LIST_MARKET_POLL_MS } from '../config/marketPoll.js';
import CoinIcon from '../components/CoinIcon.jsx';

const LiveChart = lazy(() => import('../components/LiveChart.jsx'));

const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'];

const MOCK_GAINERS = [
  { name: 'SOL', price: 142.5, change: 8.24 },
  { name: 'BNB', price: 612.3, change: 5.12 },
  { name: 'XRP', price: 0.62, change: 4.88 },
];

const MOCK_LOSERS = [
  { name: 'DOGE', price: 0.14, change: -3.45 },
  { name: 'ADA', price: 0.48, change: -2.91 },
  { name: 'DOT', price: 7.12, change: -1.76 },
];

function resolveChartInterval(tf) {
  if (tf === '1H') return '1h';
  if (tf === '4H') return '4h';
  if (tf === '1D') return '1d';
  return tf;
}

export default function Dashboard() {
  const { toInr } = usePlatformConfig();
  const { wallet: liveWallet, walletVersion } = useRealtime();
  const { pairs: tradingPairs } = useTradingPairs();
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [candles, setCandles] = useState([]);
  const [ticker, setTicker] = useState(null);

  const chartAssets = useMemo(() => {
    const active = (tradingPairs || [])
      .filter((p) => p.isActive !== false && (p.quoteAsset === 'USDT' || String(p.symbol).endsWith('USDT')))
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    const top = active.slice(0, 3).map((p) => p.symbol);
    return top.length ? top : ['BTCUSDT', 'ETHUSDT'];
  }, [tradingPairs]);

  useEffect(() => {
    if (!chartAssets.includes(symbol)) setSymbol(chartAssets[0]);
  }, [chartAssets, symbol]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [sum, ordRes] = await Promise.all([
          dashboardAPI.getSummary().catch(() => null),
          api
            .get('/orders', {
              params: { page: 1, pageSize: 8, sortBy: 'createdAt', sortDir: 'desc' },
            })
            .then((r) => parseApiResponse(r.data))
            .catch(() => ({ rows: [] })),
        ]);
        if (!active) return;
        setSummary(sum);
        setOrders(Array.isArray(ordRes?.rows) ? ordRes.rows : []);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    // Refresh P&L with live market prices
    const poll = setInterval(load, LIST_MARKET_POLL_MS);

    const onOrders = () => load();
    const onWallet = () => load();
    window.addEventListener('orders:updated', onOrders);
    window.addEventListener('wallet:updated', onWallet);
    return () => {
      active = false;
      clearInterval(poll);
      window.removeEventListener('orders:updated', onOrders);
      window.removeEventListener('wallet:updated', onWallet);
    };
  }, [walletVersion]);

  useEffect(() => {
    let active = true;
    const interval = resolveChartInterval(timeframe);
    (async () => {
      try {
        const [tRes, kRes] = await Promise.all([
          api.get('/market/ticker', { params: { symbol } }),
          api.get('/market/klines', { params: { symbol, interval, limit: 200 } }),
        ]);
        if (!active) return;
        setTicker(parseApiResponse(tRes.data));
        const k = parseApiResponse(kRes.data);
        setCandles(Array.isArray(k?.candles) ? k.candles : []);
      } catch {
        if (active) {
          setCandles([]);
          setTicker(null);
        }
      }
    })();
    const poll = setInterval(async () => {
      try {
        const [tRes, kRes] = await Promise.all([
          api.get('/market/ticker', { params: { symbol } }),
          api.get('/market/klines', { params: { symbol, interval, limit: 200 } }),
        ]);
        if (!active) return;
        setTicker(parseApiResponse(tRes.data));
        const k = parseApiResponse(kRes.data);
        if (Array.isArray(k?.candles) && k.candles.length) setCandles(k.candles);
      } catch {
        /* keep last */
      }
    }, 15_000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [symbol, timeframe]);

  const balance = useMemo(() => {
    const fromSummary =
      summary?.wallet?.total_balance_usdt ??
      summary?.wallet?.balance_usdt ??
      summary?.wallet_balance ??
      summary?.total_balance;
    if (fromSummary != null && Number.isFinite(Number(fromSummary))) return Number(fromSummary);

    if (liveWallet) {
      return Number(liveWallet.total_balance_usdt ?? liveWallet.balance_usdt ?? liveWallet.balance ?? 0);
    }
    return 0;
  }, [summary, liveWallet]);

  const pnl =
    summary?.stats?.today_pnl ??
    summary?.stats?.total_pnl ??
    summary?.total_pnl ??
    summary?.pnl ??
    0;
  const openPos =
    summary?.stats?.open_positions_count ??
    summary?.open_positions ??
    summary?.open_positions_count ??
    0;
  const pnlUp = Number(pnl) >= 0;
  const lastPrice = Number(ticker?.lastPrice ?? ticker?.price ?? 0);

  const stats = useMemo(
    () => [
      { label: 'Total Balance', value: fmtINR(toInr(balance)), sub: `≈ ${fmtUSD(balance)}` },
      {
        label: "Today's P&L",
        value: fmtINR(toInr(pnl)),
        sub: `≈ ${fmtUSD(pnl)}`,
        colored: true,
        up: pnlUp,
      },
      { label: 'Open Positions', value: String(openPos) },
    ],
    [balance, pnl, openPos, pnlUp, toInr]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium text-text-primary mb-1">Dashboard</h1>
        <p className="text-sm text-text-secondary">Portfolio overview and market activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div className="skeleton h-3 w-20 mb-3" />
                <div className="skeleton h-7 w-32" />
              </div>
            ))
          : stats.map((s) => (
              <div key={s.label} className="stat-card">
                <p className="stat-card__label">{s.label}</p>
                <p
                  className={`stat-card__value${
                    s.colored ? (s.up ? ' text-profit' : ' text-loss') : ''
                  }`}
                >
                  {s.value}
                </p>
                {s.sub && <p className="text-xs text-text-muted mt-1">{s.sub}</p>}
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="ui-card p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
            <div className="tab-row !inline-flex !p-0.5 !bg-transparent gap-1">
              {chartAssets.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`!flex-none px-3 py-1.5 rounded-btn text-xs${symbol === a ? ' is-active !bg-bg-tertiary' : ''}`}
                  onClick={() => setSymbol(a)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CoinIcon symbol={a.replace(/USDT$|INR$/, '')} size={16} />
                    {a.replace('USDT', '/USDT').replace('INR', '/INR')}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-2xl font-medium tabular-nums">
                  {lastPrice > 0 ? fmtINR(toInr(lastPrice)) : '—'}
                </span>
                {ticker?.priceChangePercent != null && (
                  <span className={`badge ml-2 ${Number(ticker.priceChangePercent) >= 0 ? 'badge-green' : 'badge-red'}`}>
                    {fmtPct(ticker.priceChangePercent)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                className={`px-2.5 py-1 rounded-badge text-xs transition-all duration-200${
                  timeframe === tf ? ' bg-bg-tertiary text-text-primary' : ' text-text-muted'
                }`}
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="p-2 bg-[var(--ex-chart-bg,#0a0e13)] min-h-[360px]">
            <Suspense fallback={<div className="skeleton !h-[360px] w-full rounded-lg" />}>
              <LiveChart candles={candles} variant="dark" className="!h-[360px] !rounded-none !border-0" />
            </Suspense>
          </div>
        </div>

        <div className="space-y-4">
          <div className="ui-card">
            <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-profit" /> Top Gainers
            </h3>
            <ul className="space-y-2">
              {MOCK_GAINERS.map((g) => (
                <li key={g.name} className="flex justify-between text-sm items-center gap-2">
                  <span className="font-medium inline-flex items-center gap-1.5">
                    <CoinIcon symbol={g.name} size={16} />
                    {g.name}
                  </span>
                  <span className="tabular-nums text-text-secondary">{g.price}</span>
                  <span className="text-profit tabular-nums">{fmtPct(g.change)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="ui-card">
            <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
              <TrendingDown size={16} className="text-loss" /> Top Losers
            </h3>
            <ul className="space-y-2">
              {MOCK_LOSERS.map((g) => (
                <li key={g.name} className="flex justify-between text-sm items-center gap-2">
                  <span className="font-medium inline-flex items-center gap-1.5">
                    <CoinIcon symbol={g.name} size={16} />
                    {g.name}
                  </span>
                  <span className="tabular-nums text-text-secondary">{g.price}</span>
                  <span className="text-loss tabular-nums">{fmtPct(g.change)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="ui-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">Recent Orders</h2>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : orders.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const sym = String(o.symbol || o.pair || '');
                  const asset = sym.endsWith('INR')
                    ? `${sym.replace(/INR$/, '')}/INR`
                    : sym.endsWith('USDT')
                      ? `${sym.replace(/USDT$/, '')}/USDT`
                      : sym || '—';
                  const price =
                    o.avgFillPrice != null
                      ? o.avgFillPrice
                      : o.price != null
                        ? o.price
                        : o.orderType === 'market'
                          ? 'Market'
                          : '—';
                  return (
                  <tr key={o._id || o.id}>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <CoinIcon symbol={String(sym).replace(/USDT$|INR$/, '')} size={18} />
                        {asset}
                      </span>
                    </td>
                    <td><StatusBadge status={o.side || o.type} /></td>
                    <td className="tabular-nums">{o.quantity ?? o.qty ?? '—'}</td>
                    <td className="tabular-nums">{price}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-text-secondary text-xs">
                      {o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state !py-8">
            <Inbox size={28} className="mb-2 opacity-40" />
            <p>No orders yet</p>
            <Link to="/trade" className="text-accent text-sm mt-2">Start trading</Link>
          </div>
        )}
      </div>
    </div>
  );
}
