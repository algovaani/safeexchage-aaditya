import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Inbox } from 'lucide-react';
import { api, dashboardAPI, parseApiResponse } from '../api/client.js';
import LiveChart from '../components/LiveChart.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { fmtINR, fmtUSD, fmtPct, inrFromUsdt } from '../utils/format.js';

const ASSETS = ['BTCUSDT', 'ETHUSDT'];
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

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [candles, setCandles] = useState([]);
  const [ticker, setTicker] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [sum, ord] = await Promise.all([
          dashboardAPI.getSummary().catch(() => null),
          api.get('/orders/open').then((r) => parseApiResponse(r.data)).catch(() => []),
        ]);
        setSummary(sum);
        setOrders(Array.isArray(ord) ? ord.slice(0, 8) : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [tRes, kRes] = await Promise.all([
          api.get('/market/ticker', { params: { symbol } }),
          api.get('/market/klines', { params: { symbol, interval: timeframe === '1H' ? '1h' : timeframe === '1D' ? '1d' : timeframe, limit: 200 } }),
        ]);
        if (!active) return;
        setTicker(parseApiResponse(tRes.data));
        const k = parseApiResponse(kRes.data);
        setCandles(k?.candles || []);
      } catch {
        if (active) setCandles([]);
      }
    })();
    return () => { active = false; };
  }, [symbol, timeframe]);

  const balance = summary?.wallet_balance ?? summary?.total_balance ?? 0;
  const pnl = summary?.total_pnl ?? summary?.pnl ?? 0;
  const openPos = summary?.open_positions ?? summary?.open_positions_count ?? 0;
  const winRate = summary?.win_rate ?? 62.4;
  const pnlUp = Number(pnl) >= 0;

  const stats = useMemo(
    () => [
      { label: 'Total Balance', value: fmtINR(inrFromUsdt(balance)), sub: `≈ ${fmtUSD(balance)}` },
      {
        label: "Today's P&L",
        value: fmtINR(inrFromUsdt(pnl)),
        colored: true,
        up: pnlUp,
      },
      { label: 'Open Positions', value: String(openPos) },
      { label: 'Win Rate', value: `${Number(winRate).toFixed(1)}%` },
    ],
    [balance, pnl, openPos, winRate, pnlUp]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium text-text-primary mb-1">Dashboard</h1>
        <p className="text-sm text-text-secondary">Portfolio overview and market activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
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
              {ASSETS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`!flex-none px-3 py-1.5 rounded-btn text-xs${symbol === a ? ' is-active !bg-bg-tertiary' : ''}`}
                  onClick={() => setSymbol(a)}
                >
                  {a.replace('USDT', '/USDT')}
                </button>
              ))}
              <button type="button" className="!flex-none px-3 py-1.5 rounded-btn text-xs text-text-muted">
                NIFTY
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-2xl font-medium tabular-nums">
                  {ticker?.lastPrice ? fmtINR(inrFromUsdt(ticker.lastPrice)) : '—'}
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
          <div className="p-2">
            <LiveChart candles={candles} variant="dark" className="!h-[360px] !rounded-none !border-0" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="ui-card">
            <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-profit" /> Top Gainers
            </h3>
            <ul className="space-y-2">
              {MOCK_GAINERS.map((g) => (
                <li key={g.name} className="flex justify-between text-sm">
                  <span className="font-medium">{g.name}</span>
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
                <li key={g.name} className="flex justify-between text-sm">
                  <span className="font-medium">{g.name}</span>
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
                {orders.map((o) => (
                  <tr key={o._id || o.id}>
                    <td>{o.symbol || o.pair || '—'}</td>
                    <td><StatusBadge status={o.side || o.type} /></td>
                    <td className="tabular-nums">{o.quantity ?? o.qty ?? '—'}</td>
                    <td className="tabular-nums">{o.price ?? '—'}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-text-secondary text-xs">
                      {o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Inbox size={32} className="mb-3 opacity-40" />
            <p>No orders yet</p>
            <Link to="/trade" className="text-accent text-sm mt-2">Start trading</Link>
          </div>
        )}
      </div>
    </div>
  );
}
