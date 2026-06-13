import { useEffect, useMemo, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api, parseApiResponse } from '../api/client.js';
import LiveChart from '../components/LiveChart.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import './Trading.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

const WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

function fmtNum(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function fmtLocale(value, options) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, options) : '—';
}

export default function Trading() {
  const { isDark } = useTheme();
  const INTERVAL = '1s';

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [marketTab, setMarketTab] = useState('USDT');
  const [search, setSearch] = useState('');
  const [candles, setCandles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ticker, setTicker] = useState(null);
  const [balances, setBalances] = useState(null);
  const [depth, setDepth] = useState({ bids: [], asks: [], mid: null });
  const [tape, setTape] = useState([]);

  const [buyType, setBuyType] = useState('limit');
  const [sellType, setSellType] = useState('limit');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyQty, setBuyQty] = useState('0.001');
  const [sellQty, setSellQty] = useState('0.001');
  const [note, setNote] = useState('');

  const [watchPrices, setWatchPrices] = useState({});

  const socketUrl = useMemo(() => SOCKET_URL, []);

  const filteredList = useMemo(() => {
    const q = search.trim().toUpperCase();
    return WATCHLIST.filter((p) => p.includes('USDT') && (!q || p.includes(q)));
  }, [search]);

  const loadTicker = useCallback(async () => {
    const { data } = await api.get('/market/ticker', { params: { symbol } });
    const ticker = parseApiResponse(data);
    setTicker(ticker);
    setBuyPrice((p) => p || String(ticker?.lastPrice ?? ''));
    setSellPrice((p) => p || String(ticker?.lastPrice ?? ''));
  }, [symbol]);

  useEffect(() => {
    setBuyPrice('');
    setSellPrice('');
  }, [symbol]);

  useEffect(() => {
    loadTicker().catch(() => {});
    const id = setInterval(() => loadTicker().catch(() => {}), 4000);
    return () => clearInterval(id);
  }, [loadTicker]);

  useEffect(() => {
    (async () => {
      const out = {};
      await Promise.all(
        WATCHLIST.map(async (s) => {
          try {
            const { data } = await api.get('/market/ticker', { params: { symbol: s } });
            out[s] = parseApiResponse(data);
          } catch {
            out[s] = null;
          }
        })
      );
      setWatchPrices(out);
    })();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await api.get('/market/klines', {
        params: { symbol, interval: INTERVAL, limit: 400 },
      });
      if (!active) return;
      const klines = parseApiResponse(data);
      setCandles(klines?.candles || []);
    })();
    return () => {
      active = false;
    };
  }, [symbol]);

  useEffect(() => {
    const socket = io(socketUrl, { transports: ['websocket'] });
    socket.emit('market:subscribe', { symbol, interval: INTERVAL });

    const sym = symbol.toUpperCase();

    const onMerged = (payload) => {
      if (!payload?.candle || payload.symbol !== sym) return;
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
      if (!payload || payload.symbol !== symbol) return;
      setDepth({
        bids: payload.bids || [],
        asks: payload.asks || [],
        mid: payload.mid,
      });
    };

    const onTrade = (payload) => {
      if (!payload) return;
      setTape((prev) => {
        const next = [{ ...payload, _id: `${payload.time}-${Math.random()}` }, ...prev];
        return next.slice(0, 40);
      });
    };

    socket.on('market:klines:merged', onMerged);
    socket.on('market:manual:updated', onManual);
    socket.on('market:depth', onDepth);
    socket.on('market:trade', onTrade);

    return () => {
      socket.emit('market:unsubscribe', { symbol, interval: INTERVAL });
      socket.off('market:klines:merged', onMerged);
      socket.off('market:manual:updated', onManual);
      socket.off('market:depth', onDepth);
      socket.off('market:trade', onTrade);
      socket.close();
    };
  }, [socketUrl, symbol]);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: w }] = await Promise.all([api.get('/orders'), api.get('/wallet/balance')]);
      const orders = parseApiResponse(o);
      const wallet = parseApiResponse(w);
      setOrders(Array.isArray(orders) ? orders : []);
      setBalances(wallet);
    })();
  }, []);

  async function place(side, orderType) {
    setNote('');
    const qty = parseFloat(side === 'buy' ? buyQty : sellQty);
    const priceRaw = side === 'buy' ? buyPrice : sellPrice;
    const payload = {
      symbol,
      side,
      orderType,
      quantity: qty,
      price: orderType === 'limit' ? parseFloat(priceRaw) : null,
      stopLoss: null,
      takeProfit: null,
    };
    await api.post('/orders', payload);
    setNote(`Order sent (${side} ${orderType}).`);
    const { data } = await api.get('/orders');
    const orders = parseApiResponse(data);
    setOrders(Array.isArray(orders) ? orders : []);
  }

  const changePct = ticker?.priceChangePercent ?? 0;
  const up = changePct >= 0;
  const base = symbol.replace('USDT', '');

  return (
    <div className="trading-page">
      <div className="ex-ticker">
        <div className="ex-ticker__pair-wrap">
          <span className="ex-ticker__live">
            <span className="ex-ticker__live-dot" aria-hidden />
            Live
          </span>
          <span className="ex-ticker__pair">{base}/USDT</span>
        </div>

        <div className="ex-ticker__price-block">
          <span className={`ex-ticker__price ${up ? 'ex-ticker__price--up' : 'ex-ticker__price--down'}`}>
            {ticker ? fmtLocale(ticker.lastPrice, { maximumFractionDigits: 6 }) : '—'}
          </span>
        </div>

        <div className="ex-ticker__stats">
          <div className={`ex-ticker__stat ${up ? 'ex-ticker__stat--up' : 'ex-ticker__stat--down'}`}>
            <span>24h change</span>
            <span>
              {ticker
                ? `${
                    ticker.priceChange != null && Number.isFinite(Number(ticker.priceChange))
                      ? `${Number(ticker.priceChange) >= 0 ? '+' : ''}${fmtNum(ticker.priceChange, 2)} `
                      : ''
                  }(${fmtNum(changePct, 3)}%)`
                : '—'}
            </span>
          </div>
          <div className="ex-ticker__stat">
            <span>24h high / low</span>
            <span>
              {ticker ? `${fmtNum(ticker.highPrice, 2)} / ${fmtNum(ticker.lowPrice, 2)}` : '—'}
            </span>
          </div>
          <div className="ex-ticker__stat">
            <span>24h volume</span>
            <span>{ticker ? fmtLocale(ticker.volume, { maximumFractionDigits: 2 }) : '—'}</span>
          </div>
          <div className="ex-ticker__stat">
            <span>Interval</span>
            <span>1s candles</span>
          </div>
        </div>

        <div className="ex-portfolio">
          <small>Available balance</small>
          {balances != null ? `${Number(balances.balance_usdt ?? balances.balance ?? 0).toFixed(2)} USDT` : '—'}
        </div>
      </div>

      <div className="ex-grid">
        <aside className="ex-panel ex-markets">
          <div className="ex-markets__tabs">
            <button type="button" className={marketTab === 'USDT' ? 'is-active' : ''} onClick={() => setMarketTab('USDT')}>
              USDT
            </button>
            <button type="button" className={marketTab === 'INR' ? 'is-active' : ''} onClick={() => setMarketTab('INR')} disabled>
              INR
            </button>
          </div>
          <div className="ex-markets__search">
            <input
              className="ex-input"
              placeholder="Search pair"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ex-panel__head">Markets</div>
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
                  <span style={{ color: pct >= 0 ? 'var(--ex-buy)' : 'var(--ex-sell)' }}>
                    {w ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ex-markets__balance">
            <small style={{ color: 'var(--ex-muted)', fontSize: '0.72rem' }}>SPOT balance</small>
            <div>
              <strong>{balances != null ? `${Number(balances.balance_usdt ?? balances.balance ?? 0).toFixed(2)}` : '—'}</strong> USDT
            </div>
          </div>
        </aside>

        <section className="ex-center">
          <div className="ex-panel ex-chart-area">
            <div className="ex-panel__head">{symbol} · Live chart</div>
            <LiveChart variant={isDark ? 'dark' : 'light'} className="ex-chart-wrap" candles={candles} />
          </div>

          <div className="ex-orders">
            <div className="ex-panel ex-order-card ex-order-card--buy">
              <h3>Buy {base}</h3>
              <div className="ex-tabs-inline">
                <button type="button" className={buyType === 'limit' ? 'is-active' : ''} onClick={() => setBuyType('limit')}>
                  Limit
                </button>
                <button type="button" className={buyType === 'market' ? 'is-active' : ''} onClick={() => setBuyType('market')}>
                  Market
                </button>
              </div>
              <div className="field">
                <label>Price</label>
                <input
                  className="ex-input"
                  disabled={buyType === 'market'}
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Amount</label>
                <input className="ex-input" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
              </div>
              <p className="ex-footnote">Fee (simulated): 0.1%</p>
              <button type="button" className="ex-btn-buy" onClick={() => place('buy', buyType)}>
                Buy {base}
              </button>
            </div>

            <div className="ex-panel ex-order-card ex-order-card--sell">
              <h3>Sell {base}</h3>
              <div className="ex-tabs-inline">
                <button type="button" className={sellType === 'limit' ? 'is-active' : ''} onClick={() => setSellType('limit')}>
                  Limit
                </button>
                <button
                  type="button"
                  className={sellType === 'market' ? 'is-active' : ''}
                  onClick={() => setSellType('market')}
                >
                  Market
                </button>
              </div>
              <div className="field">
                <label>Price</label>
                <input
                  className="ex-input"
                  disabled={sellType === 'market'}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Amount</label>
                <input className="ex-input" value={sellQty} onChange={(e) => setSellQty(e.target.value)} />
              </div>
              <p className="ex-footnote">Fee (simulated): 0.1%</p>
              <button type="button" className="ex-btn-sell" onClick={() => place('sell', sellType)}>
                Sell {base}
              </button>
            </div>
          </div>

          <div className="ex-panel ex-my-orders">
            <div className="ex-panel__head">My orders</div>
            <table>
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td>{o.symbol}</td>
                    <td>
                      <span className={`ex-side-badge ex-side-badge--${o.side}`}>{o.side}</span>
                    </td>
                    <td>{o.orderType}</td>
                    <td>{o.quantity}</td>
                    <td>{o.price ?? '—'}</td>
                    <td>
                      <span className="ex-status-badge">{o.status}</span>
                    </td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan={6} className="ex-empty-row">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {note && <p className="ex-note">{note}</p>}
          </div>
        </section>

        <aside className="ex-side-stack">
          <div className="ex-panel">
            <div className="ex-panel__head">Order book</div>
            <div className="ex-book">
              <div className="ex-book__header">
                <span>Price</span>
                <span>Qty</span>
                <span>Total</span>
              </div>
              <div className="ex-book__side">
                {[...(depth.asks || [])].reverse().map((r, i) => (
                  <div key={`a-${i}`} className="ex-book__row ex-book__row--ask">
                    <span>{r.price.toFixed(6)}</span>
                    <span>{r.qty.toFixed(4)}</span>
                    <span>{(r.price * r.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="ex-book__mid">
                {depth.mid != null
                  ? depth.mid.toLocaleString(undefined, { maximumFractionDigits: 6 })
                  : ticker?.lastPrice?.toLocaleString() ?? '—'}
              </div>
              <div className="ex-book__side">
                {(depth.bids || []).map((r, i) => (
                  <div key={`b-${i}`} className="ex-book__row ex-book__row--bid">
                    <span>{r.price.toFixed(6)}</span>
                    <span>{r.qty.toFixed(4)}</span>
                    <span>{(r.price * r.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ex-panel">
            <div className="ex-panel__head">Recent trades</div>
            <div className="ex-tape">
              <div className="ex-tape__header">
                <span>Price</span>
                <span>Qty</span>
                <span>Time</span>
              </div>
              {tape.map((t) => (
                <div
                  key={t._id}
                  className={`ex-tape__row ${t.isBuyerMaker ? 'ex-tape__row--sell' : 'ex-tape__row--buy'}`}
                >
                  <span>{t.price.toFixed(6)}</span>
                  <span>{t.qty.toFixed(5)}</span>
                  <span>{new Date(t.time).toLocaleTimeString()}</span>
                </div>
              ))}
              {!tape.length && (
                <div className="ex-tape__empty">Listening for trades…</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
