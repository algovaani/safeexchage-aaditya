import { useEffect, useMemo, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api/client.js';
import LiveChart from '../components/LiveChart.jsx';
import './Trading.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

export default function Trading() {
  const INTERVAL = '1s';

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [marketTab, setMarketTab] = useState('USDT');
  const [search, setSearch] = useState('');
  const [candles, setCandles] = useState([]);
  const [tick, setTick] = useState(null);
  const [reset, setReset] = useState(null);
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
    setTicker(data);
    setBuyPrice((p) => p || String(data.lastPrice));
    setSellPrice((p) => p || String(data.lastPrice));
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
            out[s] = data;
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
      setCandles(data.candles || []);
      setTick(null);
      setReset(null);
    })();
    return () => {
      active = false;
    };
  }, [symbol]);

  useEffect(() => {
    const socket = io(socketUrl, { transports: ['websocket'] });
    socket.emit('market:subscribe', { symbol, interval: INTERVAL });

    const onMerged = (payload) => {
      if (!payload?.candle) return;
      setTick(payload.candle);
    };

    const onManual = (payload) => {
      if (payload?.candles?.length) setReset(payload.candles);
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
      setOrders(o);
      setBalances(w);
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
    setOrders(data);
  }

  const changePct = ticker?.priceChangePercent ?? 0;
  const up = changePct >= 0;

  return (
    <div className="trading-page">
      <div className="ex-ticker">
        <div className="ex-ticker__pair">
          {symbol.replace('USDT', '')}/USDT
        </div>
        <div className="ex-ticker__stat">
          <span>Last price</span>
          <span>{ticker ? ticker.lastPrice.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}</span>
        </div>
        <div className={`ex-ticker__stat ${up ? 'ex-ticker__stat--up' : 'ex-ticker__stat--down'}`}>
          <span>24h change</span>
          <span>
            {ticker
              ? `${ticker.priceChange >= 0 ? '+' : ''}${ticker.priceChange.toFixed(2)} (${changePct.toFixed(3)}%)`
              : '—'}
          </span>
        </div>
        <div className="ex-ticker__stat">
          <span>24h high / low</span>
          <span>
            {ticker
              ? `${ticker.highPrice.toFixed(2)} / ${ticker.lowPrice.toFixed(2)}`
              : '—'}
          </span>
        </div>
        <div className="ex-ticker__stat">
          <span>24h volume (base)</span>
          <span>{ticker ? ticker.volume.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</span>
        </div>
        <div className="ex-ticker__stat">
          <span>Interval</span>
          <span>1s (trade-aggregated)</span>
        </div>
        <div className="ex-portfolio">
          Portfolio: {balances != null ? `${Number(balances.balance).toFixed(2)} USDT` : '—'}
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
          <div className="ex-panel__head" style={{ border: 'none' }}>
            Pair / Price / 24h
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
                  <span>{w ? w.lastPrice.toFixed(w.lastPrice < 1 ? 6 : 2) : '—'}</span>
                  <span style={{ color: pct >= 0 ? 'var(--ex-buy)' : 'var(--ex-sell)' }}>
                    {w ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ex-panel__head">Spot balance</div>
          <div style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem' }}>
            {balances != null ? `${Number(balances.balance).toFixed(2)} USDT` : '—'}
          </div>
        </aside>

        <section className="ex-center">
          <div className="ex-panel ex-chart-area">
            <div className="ex-panel__head">{symbol} · 1s candles (live trades)</div>
            <LiveChart
              variant="light"
              className="ex-chart-wrap"
              candles={candles}
              tick={tick}
              reset={reset}
            />
          </div>

          <div className="ex-orders">
            <div className="ex-panel ex-order-card ex-order-card--buy">
              <h3>Buy {symbol.replace('USDT', '')}</h3>
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
                Buy {symbol.replace('USDT', '')}
              </button>
            </div>

            <div className="ex-panel ex-order-card ex-order-card--sell">
              <h3>Sell {symbol.replace('USDT', '')}</h3>
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
                Sell {symbol.replace('USDT', '')}
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
                    <td>{o.side}</td>
                    <td>{o.orderType}</td>
                    <td>{o.quantity}</td>
                    <td>{o.price ?? '—'}</td>
                    <td>{o.status}</td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan={6} style={{ color: 'var(--ex-muted)' }}>
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {note && <p className="ex-footnote">{note}</p>}
          </div>
        </section>

        <aside className="ex-side-stack">
          <div className="ex-panel">
            <div className="ex-panel__head">Order book</div>
            <div className="ex-book">
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
                <div style={{ padding: '0.5rem', color: 'var(--ex-muted)', fontSize: '0.75rem' }}>
                  Listening for trades…
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
