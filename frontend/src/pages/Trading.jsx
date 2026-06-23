import { useEffect, useMemo, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api, parseApiResponse } from '../api/client.js';
import LiveChart from '../components/LiveChart.jsx';
import { TRADING_PAIR_SYMBOLS } from '../config/tradingPairs.js';
import { MARKET_POLL_MS } from '../config/marketPoll.js';
import { formatLiveClock, formatMarketTime } from '../utils/timeFormat.js';
import './Trading.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

const WATCHLIST = TRADING_PAIR_SYMBOLS;

const CHART_INTERVALS = [
  { id: '1m', label: '1m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '1d', label: '1D' },
];

function fmtNum(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function fmtLocale(value, options) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, options) : '—';
}

function isPendingOrder(o) {
  return o.status === 'open' || o.status === 'partially_filled';
}

export default function Trading() {
  const [symbol, setSymbol] = useState('BNBUSDT');
  const [marketTab, setMarketTab] = useState('USDT');
  const [search, setSearch] = useState('');
  const [chartInterval, setChartInterval] = useState('1m');
  const [candles, setCandles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ticker, setTicker] = useState(null);
  const [balances, setBalances] = useState(null);
  const [depth, setDepth] = useState({ bids: [], asks: [], mid: null });
  const [tape, setTape] = useState([]);

  const [buyType, setBuyType] = useState('market');
  const [sellType, setSellType] = useState('market');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyQty, setBuyQty] = useState('0.01');
  const [sellQty, setSellQty] = useState('0.01');
  const [note, setNote] = useState('');

  const [orderSideTab, setOrderSideTab] = useState('buy');
  const [orderStatusTab, setOrderStatusTab] = useState('pending');

  const [watchPrices, setWatchPrices] = useState({});
  const [liveClock, setLiveClock] = useState(() => formatLiveClock());

  const usdtBalance = Number(balances?.balance_usdt ?? balances?.balance ?? 0);

  const filteredList = useMemo(() => {
    const q = search.trim().toUpperCase();
    return WATCHLIST.filter((p) => p.includes('USDT') && (!q || p.includes(q)));
  }, [search]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const sideMatch = o.side === orderSideTab;
      const pending = isPendingOrder(o);
      const statusMatch = orderStatusTab === 'pending' ? pending : !pending;
      return sideMatch && statusMatch;
    });
  }, [orders, orderSideTab, orderStatusTab]);

  const buyTotal = useMemo(() => {
    const p = buyType === 'market' ? Number(ticker?.lastPrice) : parseFloat(buyPrice);
    const q = parseFloat(buyQty);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return '';
    return (p * q).toFixed(2);
  }, [buyType, buyPrice, buyQty, ticker?.lastPrice]);

  const sellTotal = useMemo(() => {
    const p = sellType === 'market' ? Number(ticker?.lastPrice) : parseFloat(sellPrice);
    const q = parseFloat(sellQty);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return '';
    return (p * q).toFixed(2);
  }, [sellType, sellPrice, sellQty, ticker?.lastPrice]);

  const loadLivePrices = useCallback(async () => {
    const { data } = await api.get('/market/prices/live');
    const payload = parseApiResponse(data);
    const pairs = payload?.pairs || [];
    const bySym = {};

    for (const row of pairs) {
      if (!row?.symbol) continue;
      bySym[row.symbol] = {
        symbol: row.symbol,
        lastPrice: row.price,
        priceChangePercent: row.change_24h,
        highPrice: row.high_24h,
        lowPrice: row.low_24h,
        volume: row.volume,
      };
    }

    setWatchPrices(bySym);

    const sym = symbol.toUpperCase();
    const active = bySym[sym];
    if (active) {
      setTicker((prev) => ({ ...prev, ...active }));
      setBuyPrice((p) => p || String(active.lastPrice ?? ''));
      setSellPrice((p) => p || String(active.lastPrice ?? ''));
    }
  }, [symbol]);

  useEffect(() => {
    setBuyPrice('');
    setSellPrice('');
  }, [symbol]);

  useEffect(() => {
    loadLivePrices().catch(() => {});
    const id = setInterval(() => loadLivePrices().catch(() => {}), MARKET_POLL_MS);
    return () => clearInterval(id);
  }, [loadLivePrices]);

  useEffect(() => {
    setLiveClock(formatLiveClock());
    const id = setInterval(() => setLiveClock(formatLiveClock()), MARKET_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await api.get('/market/klines', {
        params: { symbol, interval: chartInterval, limit: 400 },
      });
      if (!active) return;
      const klines = parseApiResponse(data);
      setCandles(klines?.candles || []);
    })();
    return () => {
      active = false;
    };
  }, [symbol, chartInterval]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    const sym = symbol.toUpperCase();

    socket.emit('market:subscribe', { symbol: sym, interval: chartInterval });
    if (chartInterval !== '1s') {
      socket.emit('market:subscribe', { symbol: sym, interval: '1s' });
    }

    const onMerged = (payload) => {
      if (!payload?.candle || payload.symbol !== sym || payload.interval !== chartInterval) return;
      const c = payload.candle;
      setCandles((prev) => {
        if (!prev.length) return [c];
        const last = prev[prev.length - 1];
        if (c.openTime === last.openTime) return [...prev.slice(0, -1), c];
        if (c.openTime > last.openTime) return [...prev.slice(-399), c];
        const idx = prev.findIndex((x) => x.openTime === c.openTime);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = c;
          return next;
        }
        return prev;
      });
    };

    const onManual = (payload) => {
      if (payload?.symbol && payload.symbol !== sym) return;
      if (payload?.candles?.length) setCandles(payload.candles.slice(-400));
    };

    const onDepth = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      setDepth({
        bids: payload.bids || [],
        asks: payload.asks || [],
        mid: payload.mid,
      });
    };

    const onTrade = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      setTicker((prev) => ({ ...prev, lastPrice: payload.price, symbol: sym }));
      setWatchPrices((prev) => ({
        ...prev,
        [sym]: {
          ...(prev[sym] || { symbol: sym }),
          lastPrice: payload.price,
        },
      }));
      setTape((prev) => {
        const next = [{ ...payload, symbol: sym, _id: `${payload.time}-${Math.random()}` }, ...prev];
        return next.slice(0, 50);
      });
    };

    socket.on('market:klines:merged', onMerged);
    socket.on('market:manual:updated', onManual);
    socket.on('market:depth', onDepth);
    socket.on('market:trade', onTrade);

    return () => {
      socket.emit('market:unsubscribe', { symbol: sym, interval: chartInterval });
      if (chartInterval !== '1s') {
        socket.emit('market:unsubscribe', { symbol: sym, interval: '1s' });
      }
      socket.off('market:klines:merged', onMerged);
      socket.off('market:manual:updated', onManual);
      socket.off('market:depth', onDepth);
      socket.off('market:trade', onTrade);
      socket.close();
    };
  }, [symbol, chartInterval]);

  async function refreshOrdersAndBalance() {
    const [{ data: o }, { data: w }] = await Promise.all([
      api.get('/orders'),
      api.get('/wallet/balance'),
    ]);
    setOrders(Array.isArray(parseApiResponse(o)) ? parseApiResponse(o) : []);
    setBalances(parseApiResponse(w));
  }

  useEffect(() => {
    refreshOrdersAndBalance().catch(() => {});
  }, []);

  async function place(side, orderType) {
    setNote('');
    const qty = parseFloat(side === 'buy' ? buyQty : sellQty);
    const priceRaw = side === 'buy' ? buyPrice : sellPrice;
    if (!(qty > 0)) {
      setNote('Enter a valid quantity.');
      return;
    }
    const payload = {
      symbol,
      side,
      orderType,
      quantity: qty,
      price: orderType === 'limit' ? parseFloat(priceRaw) : null,
      stopLoss: null,
      takeProfit: null,
    };
    try {
      const { data } = await api.post('/orders', payload);
      const order = parseApiResponse(data);
      const msg =
        data?.message ||
        (order?.status === 'filled'
          ? `${side.toUpperCase()} order filled at market price`
          : `Order ${order?.status || 'placed'} (${side} ${orderType})`);
      setNote(msg);
      await refreshOrdersAndBalance();
    } catch (ex) {
      const errMsg =
        ex?.response?.data?.message || ex?.message || 'Order failed. Check balance and try again.';
      setNote(errMsg);
    }
  }

  const changePct = ticker?.priceChangePercent ?? 0;
  const up = changePct >= 0;
  const base = symbol.replace('USDT', '');

  return (
    <div className="trading-page">
      <div className="ex-ticker">
        <div className="ex-ticker__pair-wrap">
          <span className="ex-ticker__pair">{base}/USDT</span>
        </div>

        <div className="ex-ticker__stat-block">
          <span className="ex-ticker__stat-label">Last Price</span>
          <span className={`ex-ticker__price ${up ? 'ex-ticker__price--up' : 'ex-ticker__price--down'}`}>
            {ticker ? fmtLocale(ticker.lastPrice, { maximumFractionDigits: 4 }) : '—'}
          </span>
        </div>

        <div className={`ex-ticker__stat-block ${up ? 'ex-ticker__stat--up' : 'ex-ticker__stat--down'}`}>
          <span className="ex-ticker__stat-label">24h Change</span>
          <span>
            {ticker
              ? `${
                  ticker.priceChange != null && Number.isFinite(Number(ticker.priceChange))
                    ? `${Number(ticker.priceChange) >= 0 ? '+' : ''}${fmtNum(ticker.priceChange, 2)} `
                    : ''
                }(${fmtNum(changePct, 2)}%)`
              : '—'}
          </span>
        </div>

        <div className="ex-ticker__stat-block">
          <span className="ex-ticker__stat-label">24h High</span>
          <span>{ticker ? fmtNum(ticker.highPrice, 2) : '—'}</span>
        </div>

        <div className="ex-ticker__stat-block">
          <span className="ex-ticker__stat-label">24h Low</span>
          <span>{ticker ? fmtNum(ticker.lowPrice, 2) : '—'}</span>
        </div>

        <div className="ex-ticker__stat-block">
          <span className="ex-ticker__stat-label">24h Volume</span>
          <span>{ticker ? fmtLocale(ticker.volume, { maximumFractionDigits: 2 }) : '—'}</span>
        </div>

        <div className="ex-ticker__stat-block ex-ticker__stat-block--clock">
          <span className="ex-ticker__stat-label">Time</span>
          <span className="ex-ticker__clock">{liveClock}</span>
        </div>
      </div>

      <div className="ex-grid">
        <aside className="ex-panel ex-markets">
          <div className="ex-markets__tabs">
            <button type="button" className={marketTab === 'USDT' ? 'is-active' : ''} onClick={() => setMarketTab('USDT')}>
              USDT
            </button>
            <button type="button" className={marketTab === 'BNB' ? 'is-active' : ''} onClick={() => setMarketTab('BNB')} disabled>
              BNB
            </button>
          </div>
          <div className="ex-markets__search">
            <input
              className="ex-input"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ex-markets__head">
            <span>Pair</span>
            <span>Price</span>
            <span>Change</span>
          </div>
          <div className="ex-markets__list">
            {filteredList.map((p) => {
              const w = watchPrices[p];
              const active = p === symbol;
              const pct = w?.priceChangePercent ?? 0;
              return (
                <div
                  key={p}
                  className={`ex-markets__row ${active ? 'is-active' : ''}`}
                  onClick={() => setSymbol(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSymbol(p)}
                >
                  <span className="ex-markets__pair">{p.replace('USDT', '')}/USDT</span>
                  <span>
                    {w?.lastPrice != null
                      ? fmtNum(w.lastPrice, Number(w.lastPrice) < 1 ? 6 : 2)
                      : '—'}
                  </span>
                  <span className={pct >= 0 ? 'ex-change--up' : 'ex-change--down'}>
                    {w ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ex-markets__balance">
            <small>SPOT balance</small>
            <div>
              <strong>{balances != null ? usdtBalance.toFixed(2) : '—'}</strong> USDT
            </div>
          </div>
        </aside>

        <section className="ex-center">
          <div className="ex-panel ex-chart-area">
            <div className="ex-chart-toolbar">
              <div className="ex-chart-toolbar__left">
                <span className="ex-chart-toolbar__symbol">{base}/USDT</span>
                <span className="ex-chart-toolbar__dot">·</span>
                <span className="ex-chart-toolbar__exchange">SafeXchange</span>
              </div>
              <div className="ex-chart-toolbar__intervals">
                {CHART_INTERVALS.map((iv) => (
                  <button
                    key={iv.id}
                    type="button"
                    className={chartInterval === iv.id ? 'is-active' : ''}
                    onClick={() => setChartInterval(iv.id)}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
              <div className="ex-chart-toolbar__tools">
                <span>Indicators</span>
                <span>Templates</span>
              </div>
            </div>
            <LiveChart variant="exchange" className="ex-chart-wrap" candles={candles} />
          </div>

          <div className="ex-orders">
            <div className="ex-panel ex-order-card ex-order-card--buy">
              <h3>Buy {base}</h3>
              <p className="ex-balance-line">USDT: {usdtBalance.toFixed(2)}</p>
              <div className="ex-tabs-inline">
                <button type="button" className={buyType === 'limit' ? 'is-active' : ''} onClick={() => setBuyType('limit')}>
                  Limit
                </button>
                <button type="button" className={buyType === 'market' ? 'is-active' : ''} onClick={() => setBuyType('market')}>
                  Market
                </button>
              </div>
              <div className="field">
                <label>Price (USDT)</label>
                <input
                  className="ex-input"
                  disabled={buyType === 'market'}
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Amount ({base})</label>
                <input className="ex-input" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
              </div>
              <div className="field">
                <label>Total (USDT)</label>
                <input className="ex-input" readOnly value={buyTotal} placeholder="0.00" />
              </div>
              <button type="button" className="ex-btn-buy" onClick={() => place('buy', buyType)}>
                Buy {base}
              </button>
            </div>

            <div className="ex-panel ex-order-card ex-order-card--sell">
              <h3>Sell {base}</h3>
              <p className="ex-balance-line">{base}: 0</p>
              <div className="ex-tabs-inline">
                <button type="button" className={sellType === 'limit' ? 'is-active' : ''} onClick={() => setSellType('limit')}>
                  Limit
                </button>
                <button type="button" className={sellType === 'market' ? 'is-active' : ''} onClick={() => setSellType('market')}>
                  Market
                </button>
              </div>
              <div className="field">
                <label>Price (USDT)</label>
                <input
                  className="ex-input"
                  disabled={sellType === 'market'}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Amount ({base})</label>
                <input className="ex-input" value={sellQty} onChange={(e) => setSellQty(e.target.value)} />
              </div>
              <div className="field">
                <label>Total (USDT)</label>
                <input className="ex-input" readOnly value={sellTotal} placeholder="0.00" />
              </div>
              <button type="button" className="ex-btn-sell" onClick={() => place('sell', sellType)}>
                Sell {base}
              </button>
            </div>
          </div>

          <div className="ex-panel ex-my-orders">
            <div className="ex-my-orders__tabs">
              <button type="button" className={orderSideTab === 'buy' ? 'is-active' : ''} onClick={() => setOrderSideTab('buy')}>
                Buy Orders
              </button>
              <button type="button" className={orderSideTab === 'sell' ? 'is-active' : ''} onClick={() => setOrderSideTab('sell')}>
                Sell Orders
              </button>
            </div>
            <div className="ex-my-orders__subtabs">
              <button type="button" className={orderStatusTab === 'pending' ? 'is-active' : ''} onClick={() => setOrderStatusTab('pending')}>
                Pending
              </button>
              <button type="button" className={orderStatusTab === 'completed' ? 'is-active' : ''} onClick={() => setOrderStatusTab('completed')}>
                Completed
              </button>
            </div>
            <div className="ex-my-orders__scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Price</th>
                    <th>Amount</th>
                    <th>Total</th>
                    <th>Date &amp; Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const total = o.price && o.quantity ? (Number(o.price) * Number(o.quantity)).toFixed(2) : '—';
                    return (
                      <tr key={o._id}>
                        <td>{o.symbol?.replace('USDT', '')}/USDT</td>
                        <td>{o.price ?? 'Market'}</td>
                        <td>{o.quantity}</td>
                        <td>{total}</td>
                        <td>{o.createdAt ? formatMarketTime(o.createdAt) : '—'}</td>
                        <td>
                          <span className="ex-status-badge">{o.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredOrders.length && (
                    <tr>
                      <td colSpan={6} className="ex-empty-row">
                        No {orderStatusTab} {orderSideTab} orders.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {note && <p className="ex-note">{note}</p>}
          </div>
        </section>

        <aside className="ex-side-stack">
          <div className="ex-panel">
            <div className="ex-panel__head">Market Depth</div>
            <div className="ex-book">
              <div className="ex-book__header">
                <span>Price</span>
                <span>Qty</span>
                <span>Total (USDT)</span>
              </div>
              <div className="ex-book__side ex-book__side--asks">
                {[...(depth.asks || [])].reverse().slice(0, 12).map((r, i) => (
                  <div key={`a-${i}`} className="ex-book__row ex-book__row--ask">
                    <span>{r.price.toFixed(4)}</span>
                    <span>{r.qty.toFixed(4)}</span>
                    <span>{(r.price * r.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className={`ex-book__mid ${up ? 'ex-book__mid--up' : 'ex-book__mid--down'}`}>
                {depth.mid != null
                  ? depth.mid.toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : ticker?.lastPrice?.toLocaleString() ?? '—'}
              </div>
              <div className="ex-book__side ex-book__side--bids">
                {(depth.bids || []).slice(0, 12).map((r, i) => (
                  <div key={`b-${i}`} className="ex-book__row ex-book__row--bid">
                    <span>{r.price.toFixed(4)}</span>
                    <span>{r.qty.toFixed(4)}</span>
                    <span>{(r.price * r.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ex-panel">
            <div className="ex-panel__head">Recent Trades</div>
            <div className="ex-tape">
              <div className="ex-tape__header">
                <span>Price</span>
                <span>Amount</span>
                <span>Pair</span>
                <span>Time</span>
              </div>
              {tape.map((t) => (
                <div
                  key={t._id}
                  className={`ex-tape__row ${t.isBuyerMaker ? 'ex-tape__row--sell' : 'ex-tape__row--buy'}`}
                >
                  <span>{t.price.toFixed(4)}</span>
                  <span>{t.qty.toFixed(5)}</span>
                  <span>{base}/USDT</span>
                  <span>{formatMarketTime(t.time)}</span>
                </div>
              ))}
              {!tape.length && (
                <div className="ex-tape__empty">Waiting for trades…</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
