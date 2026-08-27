import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, parseApiResponse } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useTradingPairs } from '../context/TradingPairsContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { TRADE_MARKET_POLL_MS, DEPTH_POLL_MS } from '../config/marketPoll.js';
import { acquireMarketSocket, releaseMarketSocket, getUserSocket } from '../services/appSocket.js';
import CoinIcon from '../components/CoinIcon.jsx';
import './Futures.css';

const LiveChart = lazy(() => import('../components/LiveChart.jsx'));

const CHART_INTERVALS = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
];

function priceDecimals(price) {
  const p = Math.abs(Number(price));
  if (!Number.isFinite(p) || p === 0) return 4;
  if (p >= 1000) return 2;
  if (p >= 1) return 4;
  if (p >= 0.01) return 4;
  if (p >= 0.0001) return 6;
  return 8;
}

function fmtPrice(value, refPrice) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(priceDecimals(refPrice ?? n));
}

function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toFixed(6);
}

function fmtUsdt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function pnlClass(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'fut-pos' : 'fut-neg';
}

function fmtPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function snapLeverage(lev, options) {
  const n = Math.round(Number(lev));
  const allowed = (options || []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (!allowed.length) return n;
  if (allowed.includes(n)) return n;
  return allowed.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best));
}

function maxAffordableQty(available, price, leverage, feeRate) {
  const bal = Number(available);
  const px = Number(price);
  const lev = Math.max(1, Number(leverage) || 1);
  const fee = Number(feeRate) || 0;
  if (!(bal > 0) || !(px > 0)) return 0;
  return bal / (px * (1 / lev + fee));
}

function patchLastCandle(prev, price) {
  if (!prev?.length) return prev;
  const last = prev[prev.length - 1];
  const close = price;
  const open = Number(last.open) || close;
  return [
    ...prev.slice(0, -1),
    {
      ...last,
      close,
      high: Math.max(Number(last.high) || close, close),
      low: Math.min(Number(last.low) || close, close),
    },
  ];
}

function crossLiquidationLocal({ side, price, quantity, walletEquity, maintRate }) {
  const qty = Number(quantity);
  const entry = Number(price);
  const equity = Number(walletEquity);
  if (!(qty > 0) || !(entry > 0) || !Number.isFinite(equity)) return null;
  const m = Number(maintRate) || 0.004;
  let liq;
  if (side === 'short') {
    liq = (equity + entry * qty) / (qty * (1 + m));
  } else {
    liq = (entry * qty - equity) / (qty * (1 - m));
  }
  return Math.max(liq, 0);
}

function computeLocalEstimate({ quantity, price, leverage, side, config, available, marginMode }) {
  const qty = Number(quantity);
  const px = Number(price);
  const lev = Number(leverage);
  if (!(qty > 0) || !(px > 0) || !(lev > 0)) return null;

  const notional = qty * px;
  const takerFeeRate = config?.takerFeeRate ?? 0.0004;
  const maintRate = config?.maintenanceMarginRate ?? 0.004;
  const margin = notional / lev;
  const fee = notional * takerFeeRate;
  const mode = marginMode === 'isolated' ? 'isolated' : 'cross';

  let liq;
  if (mode === 'cross' && Number(available) > 0) {
    liq = crossLiquidationLocal({ side, price: px, quantity: qty, walletEquity: available, maintRate });
  } else {
    const maint = notional * maintRate;
    const buffer = Math.max(0, margin - maint);
    const delta = buffer / qty;
    liq = side === 'short' ? px + delta : px - delta;
  }

  return {
    requiredMargin: margin,
    estimatedFee: fee,
    totalRequired: margin + fee,
    liquidationPrice: Math.max(liq || 0, 0),
    price: px,
  };
}

export default function Futures() {
  const toast = useToast();
  const { user, token } = useAuth();
  const { wallet: rtWallet, walletVersion, refreshWallet, publishWallet } = useRealtime();
  const { pairs: tradingPairs, symbols: watchlistSymbols } = useTradingPairs();
  const navigate = useNavigate();

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [chartInterval, setChartInterval] = useState('4h');
  const [candles, setCandles] = useState([]);
  const [ticker, setTicker] = useState(null);
  const [depth, setDepth] = useState({ bids: [], asks: [], mid: null });
  const [tape, setTape] = useState([]);
  const [config, setConfig] = useState(null);
  const [walletLocal, setWalletLocal] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [posHistory, setPosHistory] = useState([]);
  const [bottomTab, setBottomTab] = useState('positions');
  const [busy, setBusy] = useState(false);
  const [priceUp, setPriceUp] = useState(true);

  const [side, setSide] = useState('long');
  const [orderType, setOrderType] = useState('market');
  const [quantity, setQuantity] = useState('0.01');
  const [limitPrice, setLimitPrice] = useState('');
  const [leverage, setLeverage] = useState(20);
  const [marginMode, setMarginMode] = useState('cross');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [sizePct, setSizePct] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [editPos, setEditPos] = useState(null);
  const [editTp, setEditTp] = useState('');
  const [editSl, setEditSl] = useState('');
  const [partialQty, setPartialQty] = useState('');
  const [marginAmt, setMarginAmt] = useState('');

  const prevPriceRef = useRef(null);
  const configInitRef = useRef(false);
  const tapeSeqRef = useRef(0);
  const submitLockRef = useRef(false);

  const wallet = rtWallet || walletLocal;
  const rawMarkPrice = Number(ticker?.lastPrice ?? depth.mid ?? 0);
  const markPrice = rawMarkPrice > 0 ? rawMarkPrice : 0;
  const indexPrice = markPrice;
  const priceRef = markPrice || Number(limitPrice) || 1;
  const available = Number(
    wallet?.available_balance ??
      Math.max(0, Number(wallet?.balance_usdt ?? wallet?.balance ?? 0) - Number(wallet?.locked_balance ?? 0))
  );
  const totalBalance = Number(wallet?.balance_usdt ?? wallet?.balance ?? available);

  const base = symbol.replace('USDT', '');
  const pairLabel = `${base}/USDT Perp`;

  const leverageOptions = useMemo(() => {
    if (config?.allowedLeverages?.length) {
      return config.allowedLeverages.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    }
    return [1, 2, 3, 5, 10, 20, 50, 100, 125];
  }, [config]);

  const execPrice = useMemo(() => {
    if (orderType === 'limit' && limitPrice) {
      const p = Number(limitPrice);
      if (Number.isFinite(p) && p > 0) return p;
    }
    return markPrice;
  }, [orderType, limitPrice, markPrice]);

  const localEstimate = useMemo(
    () =>
      computeLocalEstimate({
        quantity,
        price: execPrice,
        leverage,
        side,
        config,
        available: marginMode === 'cross' ? totalBalance : available,
        marginMode,
      }),
    [quantity, execPrice, leverage, side, config, available, totalBalance, marginMode]
  );

  const displayPositions = useMemo(() => {
    const liveMark = rawMarkPrice > 0 ? rawMarkPrice : null;
    return positions.map((p) => {
      const mark = liveMark ?? Number(p.markPrice) ?? Number(p.entryPrice);
      const qty = Number(p.quantity);
      const entry = Number(p.entryPrice);
      if (!(qty > 0) || !(entry > 0) || !(mark > 0)) return p;
      const upnl = p.side === 'short' ? (entry - mark) * qty : (mark - entry) * qty;
      const margin = Number(p.margin) || 0;
      const roe = margin > 0 ? (upnl / margin) * 100 : 0;
      return { ...p, markPrice: mark, unrealizedPnl: upnl, roe };
    });
  }, [positions, rawMarkPrice]);

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/futures/config');
      const cfg = parseApiResponse(data);
      setConfig(cfg);
      if (!configInitRef.current) {
        if (cfg?.defaultLeverage) setLeverage(Number(cfg.defaultLeverage));
        if (cfg?.defaultMarginMode) setMarginMode(cfg.defaultMarginMode);
        configInitRef.current = true;
      }
    } catch {
      setConfig({ enabled: false, takerFeeRate: 0.0004, maintenanceMarginRate: 0.004 });
    }
  }, []);

  const loadWallet = useCallback(async () => {
    if (!user) {
      setWalletLocal(null);
      return;
    }
    try {
      const { data } = await api.get('/wallet/balance');
      const w = parseApiResponse(data);
      setWalletLocal(w);
    } catch {
      setWalletLocal(null);
    }
  }, [user]);

  const loadPositions = useCallback(async () => {
    if (!user) {
      setPositions([]);
      return;
    }
    try {
      const { data } = await api.get('/futures/positions');
      setPositions(parseApiResponse(data)?.positions || []);
    } catch {
      setPositions([]);
    }
  }, [user]);

  const loadOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      return;
    }
    try {
      const { data } = await api.get('/futures/orders', { params: { limit: 30 } });
      setOrders(parseApiResponse(data)?.items || []);
    } catch {
      setOrders([]);
    }
  }, [user]);

  const loadPosHistory = useCallback(async () => {
    if (!user) {
      setPosHistory([]);
      return;
    }
    try {
      const { data } = await api.get('/futures/positions/history', { params: { limit: 20 } });
      setPosHistory(parseApiResponse(data)?.items || []);
    } catch {
      setPosHistory([]);
    }
  }, [user]);

  const loadTicker = useCallback(async () => {
    try {
      const { data } = await api.get('/market/ticker', { params: { symbol } });
      const t = parseApiResponse(data);
      const last = Number(t?.lastPrice ?? t?.price);
      if (Number.isFinite(last)) {
        setTicker((prev) => {
          const next = {
            lastPrice: last,
            priceChangePercent: Number(t?.priceChangePercent ?? t?.change_24h ?? prev?.priceChangePercent ?? 0),
            highPrice: Number(t?.highPrice ?? t?.high_24h ?? prev?.highPrice),
            lowPrice: Number(t?.lowPrice ?? t?.low_24h ?? prev?.lowPrice),
            volume: Number(t?.volume ?? t?.volume_24h ?? prev?.volume),
          };
          if (
            prev &&
            prev.lastPrice === next.lastPrice &&
            prev.priceChangePercent === next.priceChangePercent &&
            prev.highPrice === next.highPrice &&
            prev.lowPrice === next.lowPrice
          ) {
            return prev;
          }
          return next;
        });
        if (prevPriceRef.current != null && last !== prevPriceRef.current) {
          setPriceUp(last >= prevPriceRef.current);
        }
        prevPriceRef.current = last;
      }
    } catch {
      /* ignore */
    }
  }, [symbol]);

  const loadDepth = useCallback(async () => {
    try {
      const { data } = await api.get('/market/depth', { params: { symbol, limit: 20 } });
      const payload = parseApiResponse(data);
      if (!payload) return;
      setDepth((prev) => {
        const next = {
          bids: payload.bids || [],
          asks: payload.asks || [],
          mid: payload.mid ?? prev.mid,
        };
        if (!next.bids.length && !next.asks.length) return prev;
        return next;
      });
    } catch {
      /* keep last good depth snapshot */
    }
  }, [symbol]);

  const loadCandles = useCallback(async () => {
    try {
      const { data } = await api.get('/market/klines', {
        params: { symbol, interval: chartInterval, limit: 200 },
      });
      const klines = parseApiResponse(data);
      const next = klines?.candles || [];
      if (next.length) setCandles(next);
    } catch {
      /* keep previous candles to avoid chart flash */
    }
  }, [symbol, chartInterval]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet, walletVersion]);

  useEffect(() => {
    loadPositions();
    loadOrders();
    loadPosHistory();
  }, [loadPositions, loadOrders, loadPosHistory]);

  useEffect(() => {
    loadTicker();
    const t = setInterval(loadTicker, TRADE_MARKET_POLL_MS);
    return () => clearInterval(t);
  }, [loadTicker]);

  useEffect(() => {
    loadDepth();
    const d = setInterval(loadDepth, DEPTH_POLL_MS);
    return () => clearInterval(d);
  }, [loadDepth]);

  useEffect(() => {
    loadCandles();
  }, [loadCandles]);

  useEffect(() => {
    setTape([]);
    prevPriceRef.current = null;
    if (markPrice > 0) {
      setLimitPrice(fmtPrice(markPrice, markPrice));
    } else {
      setLimitPrice('');
    }
  }, [symbol]);

  useEffect(() => {
    if (orderType === 'limit' && markPrice > 0 && !limitPrice) {
      setLimitPrice(fmtPrice(markPrice, markPrice));
    }
  }, [orderType, symbol, markPrice, limitPrice]);

  useEffect(() => {
    const socket = acquireMarketSocket();
    const sym = symbol.toUpperCase();

    socket.emit('market:subscribe', { symbol: sym, interval: chartInterval });
    if (chartInterval !== '1s') {
      socket.emit('market:subscribe', { symbol: sym, interval: '1s' });
    }

    const onMerged = (payload) => {
      if (!payload?.candle || payload.symbol !== sym) return;
      if (payload.interval === chartInterval) {
        const c = payload.candle;
        setCandles((prev) => {
          if (!prev.length) return [c];
          const last = prev[prev.length - 1];
          if (c.openTime === last.openTime) return [...prev.slice(0, -1), c];
          if (c.openTime > last.openTime) return [...prev.slice(-499), c];
          const idx = prev.findIndex((x) => x.openTime === c.openTime);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = c;
            return next;
          }
          return prev;
        });
        return;
      }
      if (payload.interval === '1s' && chartInterval !== '1s') {
        const liveClose = Number(payload.candle.close);
        if (liveClose > 0) setCandles((prev) => patchLastCandle(prev, liveClose));
      }
    };

    const onDepth = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      setDepth((prev) => {
        const next = {
          bids: payload.bids || [],
          asks: payload.asks || [],
          mid: payload.mid ?? prev.mid,
        };
        if (!next.bids.length && !next.asks.length) return prev;
        return next;
      });
    };

    const onTrade = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      const price = Number(payload.price);
      if (Number.isFinite(price)) {
        setTicker((prev) => {
          if (prev?.lastPrice === price) return prev;
          return { ...(prev || {}), lastPrice: price };
        });
        if (prevPriceRef.current != null && price !== prevPriceRef.current) {
          setPriceUp(price >= prevPriceRef.current);
        }
        prevPriceRef.current = price;
        setCandles((prev) => patchLastCandle(prev, price));
      }

      // Heartbeat ticks (qty 0) are for last-price only — never show as tape fills
      if (payload.tickerOnly || payload.pulse) return;
      const qty = Number(payload.qty ?? payload.quantity ?? 0);
      if (!(qty > 0)) return;

      const time = Number(payload.time) || Date.now();
      const dedupeKey = `${time}|${price}|${qty}`;
      setTape((prev) => {
        // Same trade often arrives twice (depth room + 1s candle room)
        if (prev.some((row) => row._dedupe === dedupeKey)) return prev;
        tapeSeqRef.current += 1;
        return [
          { ...payload, qty, _id: `${dedupeKey}-${tapeSeqRef.current}`, _dedupe: dedupeKey },
          ...prev,
        ].slice(0, 40);
      });
    };

    socket.on('market:klines:merged', onMerged);
    socket.on('market:depth', onDepth);
    socket.on('market:trade', onTrade);

    return () => {
      socket.emit('market:unsubscribe', { symbol: sym, interval: chartInterval });
      if (chartInterval !== '1s') {
        socket.emit('market:unsubscribe', { symbol: sym, interval: '1s' });
      }
      socket.off('market:klines:merged', onMerged);
      socket.off('market:depth', onDepth);
      socket.off('market:trade', onTrade);
      releaseMarketSocket();
    };
  }, [symbol, chartInterval]);

  useEffect(() => {
    if (!user || !token) return undefined;
    const socket = getUserSocket(token);
    const onFuturesUpdate = (payload) => {
      if (payload?.positions?.length) {
        setPositions((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const p of payload.positions) {
            if (p.status === 'open') map.set(p.id, { ...map.get(p.id), ...p });
            else map.delete(p.id);
          }
          return [...map.values()].filter((p) => p.status === 'open');
        });
      }
      if (payload?.closed) loadPosHistory();
      if (
        payload?.event === 'position:opened' ||
        payload?.event?.includes('close') ||
        payload?.event?.includes('liquidat')
      ) {
        loadOrders();
        refreshWallet();
      }
    };
    socket.on('futures:update', onFuturesUpdate);
    return () => {
      socket.off('futures:update', onFuturesUpdate);
    };
  }, [user, token, loadPosHistory, loadOrders, refreshWallet]);

  function applySizePct(pct) {
    setSizePct(pct);
    if (!(available > 0) || !(execPrice > 0) || !(leverage > 0)) return;
    const maxQty = maxAffordableQty(available, execPrice, leverage, config?.takerFeeRate);
    const next = (maxQty * pct) / 100;
    setQuantity(next > 0 ? next.toFixed(6).replace(/\.?0+$/, '') || '0' : '0');
  }

  function requireLogin() {
    navigate('/login', { state: { from: { pathname: '/futures' } } });
  }

  async function submitOpen() {
    if (!user) return requireLogin();
    if (!config?.enabled) return toast.error('Futures trading is disabled');
    if (submitLockRef.current || busy) return;

    submitLockRef.current = true;
    setBusy(true);
    setConfirmOpen(false);

    try {
      const lev = snapLeverage(leverage, leverageOptions);
      const body = {
        symbol,
        side,
        orderType,
        quantity: Number(quantity),
        leverage: lev,
        marginMode,
        takeProfitPrice: takeProfit ? Number(takeProfit) : undefined,
        stopLossPrice: stopLoss ? Number(stopLoss) : undefined,
        limitPrice: orderType === 'limit' ? Number(limitPrice) : undefined,
      };
      const { data } = await api.post('/futures/open', body);
      const parsed = parseApiResponse(data);
      if (parsed?.position) {
        setPositions((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          map.set(parsed.position.id, parsed.position);
          return [...map.values()].filter((p) => p.status === 'open');
        });
      }
      if (parsed?.wallet) publishWallet(parsed.wallet);
      else await refreshWallet();
      await loadOrders();
      toast.success('Position opened');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Order failed');
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }

  async function closePosition(id, qty) {
    setBusy(true);
    try {
      await api.post(`/futures/positions/${id}/close`, qty ? { quantity: Number(qty) } : {});
      toast.success('Position closed');
      setPartialQty('');
      await loadPositions();
      await loadOrders();
      await loadPosHistory();
      await refreshWallet();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Close failed');
    } finally {
      setBusy(false);
    }
  }

  async function reversePosition(id) {
    setBusy(true);
    try {
      await api.post(`/futures/positions/${id}/reverse`);
      toast.success('Position reversed');
      await loadPositions();
      await loadOrders();
      await refreshWallet();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reverse failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveTpSl() {
    if (!editPos) return;
    setBusy(true);
    try {
      await api.patch(`/futures/positions/${editPos.id}/tpsl`, {
        takeProfitPrice: editTp ? Number(editTp) : null,
        stopLossPrice: editSl ? Number(editSl) : null,
      });
      toast.success('TP/SL updated');
      setEditPos(null);
      await loadPositions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function adjustMargin(action) {
    if (!editPos || !marginAmt) return;
    setBusy(true);
    try {
      await api.patch(`/futures/positions/${editPos.id}/margin`, {
        action,
        amount: Number(marginAmt),
      });
      toast.success(action === 'add' ? 'Margin added' : 'Margin reduced');
      setMarginAmt('');
      await loadPositions();
      await refreshWallet();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Margin update failed');
    } finally {
      setBusy(false);
    }
  }

  const disabled = !config?.enabled;
  const changePct = Number(ticker?.priceChangePercent);

  return (
    <div className="fut-page">
       

      <header className="fut-header">
        <div className="fut-header__pair">
          <select className="fut-select" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {watchlistSymbols.filter((s) => s.includes('USDT')).map((s) => (
              <option key={s} value={s}>
                {s.replace('USDT', '/USDT')}
              </option>
            ))}
          </select>
          <span className="fut-header__perp">Perp</span>
        </div>

        <div className={`fut-header__price ${priceUp ? 'fut-pos' : 'fut-neg'}`}>
          {fmtPrice(markPrice, priceRef)}
        </div>

        <div className="fut-header__stats">
          <div>
            <span>Mark</span>
            <strong>{fmtPrice(markPrice, priceRef)}</strong>
          </div>
          <div>
            <span>Index</span>
            <strong>{fmtPrice(indexPrice, priceRef)}</strong>
          </div>
          <div>
            <span>24h Change</span>
            <strong className={pnlClass(changePct)}>
              {Number.isFinite(changePct) ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
            </strong>
          </div>
          <div>
            <span>24h High</span>
            <strong>{ticker?.highPrice ? fmtPrice(ticker.highPrice, priceRef) : '—'}</strong>
          </div>
          <div>
            <span>24h Low</span>
            <strong>{ticker?.lowPrice ? fmtPrice(ticker.lowPrice, priceRef) : '—'}</strong>
          </div>
        </div>

        <div className="fut-header__wallet">
          <span>Available Balance</span>
          <strong>{user ? `${fmtUsdt(available)} USDT` : '—'}</strong>
        </div>
      </header>

      <div className="fut-workspace">
        <section className="fut-panel fut-panel--chart">
          <div className="fut-toolbar">
            <div className="fut-toolbar__intervals">
              {CHART_INTERVALS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={chartInterval === i.id ? 'is-active' : ''}
                  onClick={() => setChartInterval(i.id)}
                >
                  {i.label}
                </button>
              ))}
            </div>
            <span className="fut-toolbar__pair">
              <CoinIcon
                symbol={base}
                imageUrl={tradingPairs.find((p) => p.symbol === symbol)?.imageUrl}
                coingeckoId={tradingPairs.find((p) => p.symbol === symbol)?.coingeckoId}
                size={22}
              />
              {pairLabel}
            </span>
          </div>
          <div className="fut-chart-body">
            <Suspense fallback={<div className="fut-chart-loading">Loading chart…</div>}>
              <LiveChart variant="dark" className="fut-chart-wrap" candles={candles} />
            </Suspense>
            {!candles.length && <div className="fut-chart-loading">Loading chart…</div>}
          </div>
        </section>

        <aside className="fut-panel fut-panel--book">
          <div className="fut-panel__tabs">
            <button type="button" className="is-active">Order Book</button>
            <button type="button" disabled>Trades</button>
          </div>

          <div className="fut-book">
            <div className="fut-book__head">
              <span>Price</span>
              <span>Size</span>
              <span>Total</span>
            </div>
            <div className="fut-book__asks">
              {[...(depth.asks || [])].reverse().slice(0, 12).map((r, i) => (
                <div key={`a${i}`} className="fut-book__row fut-book__row--ask">
                  <span>{fmtPrice(r.price, priceRef)}</span>
                  <span>{fmtQty(r.qty)}</span>
                  <span>{fmtUsdt(r.price * r.qty)}</span>
                </div>
              ))}
            </div>
            <div className={`fut-book__mid ${priceUp ? 'fut-pos' : 'fut-neg'}`}>
              {fmtPrice(depth.mid ?? markPrice, priceRef)}
            </div>
            <div className="fut-book__bids">
              {(depth.bids || []).slice(0, 12).map((r, i) => (
                <div key={`b${i}`} className="fut-book__row fut-book__row--bid">
                  <span>{fmtPrice(r.price, priceRef)}</span>
                  <span>{fmtQty(r.qty)}</span>
                  <span>{fmtUsdt(r.price * r.qty)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="fut-tape">
            <div className="fut-tape__head">
              <span>Price</span>
              <span>Qty</span>
              <span>Time</span>
            </div>
            {tape.slice(0, 18).map((t) => (
              <div key={t._id} className={`fut-tape__row ${t.isBuyerMaker ? 'fut-neg' : 'fut-pos'}`}>
                <span>{fmtPrice(t.price, priceRef)}</span>
                <span>{fmtQty(t.qty ?? t.quantity)}</span>
                <span>{t.time ? new Date(t.time).toLocaleTimeString() : '—'}</span>
              </div>
            ))}
            {!tape.length && <div className="fut-tape__empty">Waiting for trades…</div>}
          </div>
        </aside>

        <aside className="fut-panel fut-panel--order">
          {/* <div className="fut-order-head">
            <button type="button" className={marginMode === 'cross' ? 'is-active' : ''} onClick={() => setMarginMode('cross')}>
              Cross
            </button>
            <button type="button" className={marginMode === 'isolated' ? 'is-active' : ''} onClick={() => setMarginMode('isolated')}>
              Isolated
            </button>
            <button type="button" className="fut-order-head__lev">{leverage}x</button>
          </div> */}

          <div className="fut-order-type">
            <button type="button" className={orderType === 'limit' ? 'is-active' : ''} onClick={() => setOrderType('limit')}>Limit</button>
            <button type="button" className={orderType === 'market' ? 'is-active' : ''} onClick={() => setOrderType('market')}>Market</button>
          </div>

          <div className="fut-side-toggle">
            <button type="button" className={side === 'long' ? 'is-long active' : ''} onClick={() => setSide('long')}>Buy / Long</button>
            <button type="button" className={side === 'short' ? 'is-short active' : ''} onClick={() => setSide('short')}>Sell / Short</button>
          </div>

          {orderType === 'limit' && (
            <label className="fut-field">
              <span>Price (USDT)</span>
              <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder="0.00" />
            </label>
          )}

          <label className="fut-field">
            <span>Size ({base})</span>
            <input value={quantity} onChange={(e) => { setQuantity(e.target.value); setSizePct(0); }} />
          </label>

          <div className="fut-size-slider">
            {[0, 25, 50, 75, 100].map((p) => (
              <button key={p} type="button" className={sizePct === p ? 'is-active' : ''} onClick={() => applySizePct(p)}>
                {p}%
              </button>
            ))}
          </div>

          <label className="fut-field">
            <span>Leverage</span>
            <div className="fut-lev-row">
              <input
                type="range"
                min={config?.minLeverage || 1}
                max={config?.maxLeverage || 125}
                value={leverage}
                onChange={(e) => setLeverage(snapLeverage(Number(e.target.value), leverageOptions))}
              />
              <strong>{leverage}x</strong>
            </div>
            <div className="fut-lev-pills">
              {leverageOptions.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={Number(leverage) === Number(l) ? 'is-active' : ''}
                  onClick={() => setLeverage(Number(l))}
                >
                  {l}x
                </button>
              ))}
            </div>
          </label>

          <div className="fut-tpsl-grid">
            <label className="fut-field">
              <span>Take Profit</span>
              <input value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Optional" />
            </label>
            <label className="fut-field">
              <span>Stop Loss</span>
              <input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <div className="fut-summary">
            <div><span>Available</span><strong>{fmtUsdt(available)} USDT</strong></div>
            <div><span>Cost</span><strong>{localEstimate ? `${fmtUsdt(localEstimate.requiredMargin)} USDT` : '—'}</strong></div>
            <div><span>Est. Fee</span><strong>{localEstimate ? `${fmtUsdt(localEstimate.estimatedFee)} USDT` : '—'}</strong></div>
            <div><span>Liq. Price</span><strong>{localEstimate?.liquidationPrice ? fmtPrice(localEstimate.liquidationPrice, priceRef) : '—'}</strong></div>
          </div>

          {!confirmOpen ? (
            <button
              type="button"
              className={`fut-submit ${side === 'long' ? 'is-long' : 'is-short'}`}
              disabled={disabled || busy || !(Number(quantity) > 0)}
              onClick={() => (user ? setConfirmOpen(true) : requireLogin())}
            >
              {side === 'long' ? 'Buy / Long' : 'Sell / Short'}
            </button>
          ) : (
            <div className="fut-confirm">
              <p>
                Confirm {side.toUpperCase()} · {quantity} {base} · {orderType} · {leverage}x · {marginMode}
              </p>
              <div className="fut-confirm__actions">
                <button type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
                <button type="button" className={side === 'long' ? 'is-long' : 'is-short'} disabled={busy} onClick={submitOpen}>
                  {busy ? 'Placing…' : 'Confirm Order'}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="fut-panel fut-panel--bottom">
        <div className="fut-bottom-tabs">
          {[
            ['positions', `Positions (${displayPositions.length})`],
            ['orders', 'Orders'],
            ['history', 'Position History'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={bottomTab === id ? 'is-active' : ''} onClick={() => setBottomTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {bottomTab === 'positions' && (
          <div className="fut-table-wrap">
            {!user ? (
              <p className="fut-empty"><Link to="/login" state={{ from: { pathname: '/futures' } }}>Log in</Link> to view positions.</p>
            ) : !displayPositions.length ? (
              <p className="fut-empty">No open positions.</p>
            ) : (
              <table className="fut-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Entry</th>
                    <th>Mark</th>
                    <th>Liq. Price</th>
                    <th>Margin</th>
                    <th>uPnL (ROE%)</th>
                    <th>TP / SL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPositions.map((p) => (
                    <tr key={p.id}>
                      <td>{p.symbol}</td>
                      <td className={p.side === 'long' ? 'fut-pos' : 'fut-neg'}>{p.side.toUpperCase()}</td>
                      <td>{fmtQty(p.quantity)}</td>
                      <td>{fmtPrice(p.entryPrice, p.entryPrice)}</td>
                      <td>{fmtPrice(p.markPrice, p.markPrice)}</td>
                      <td>{fmtPrice(p.liquidationPrice, p.liquidationPrice)}</td>
                      <td>{fmtUsdt(p.margin)}</td>
                      <td className={pnlClass(p.unrealizedPnl)}>
                        {fmtUsdt(p.unrealizedPnl)} ({fmtPct(p.roe)}%)
                      </td>
                      <td>
                        {p.takeProfitPrice ? fmtPrice(p.takeProfitPrice, p.entryPrice) : '—'} /{' '}
                        {p.stopLossPrice ? fmtPrice(p.stopLossPrice, p.entryPrice) : '—'}
                      </td>
                      <td className="fut-actions">
                        <button type="button" disabled={busy} onClick={() => closePosition(p.id)}>Close</button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditPos(p);
                            setEditTp(p.takeProfitPrice || '');
                            setEditSl(p.stopLossPrice || '');
                          }}
                        >
                          TP/SL
                        </button>
                        <button type="button" disabled={busy} onClick={() => reversePosition(p.id)}>Reverse</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {bottomTab === 'orders' && (
          <div className="fut-table-wrap">
            <table className="fut-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Action</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Fee</th>
                  <th>Status</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}</td>
                    <td>{o.symbol}</td>
                    <td className={o.side === 'long' ? 'fut-pos' : 'fut-neg'}>{o.side}</td>
                    <td>{o.action}</td>
                    <td>{fmtQty(o.quantity)}</td>
                    <td>{fmtPrice(o.price, o.price)}</td>
                    <td>{fmtUsdt(o.fee)}</td>
                    <td>{o.status || 'filled'}</td>
                    <td className={pnlClass(o.pnl)}>
                      {o.action === 'open' || o.action === 'add_margin' || o.action === 'reduce_margin'
                        ? '—'
                        : fmtUsdt(o.pnl)}
                    </td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr><td colSpan={9} className="fut-empty">No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {bottomTab === 'history' && (
          <div className="fut-table-wrap">
            <table className="fut-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Close</th>
                  <th>Realized PnL</th>
                  <th>Reason</th>
                  <th>Closed</th>
                </tr>
              </thead>
              <tbody>
                {posHistory.map((p) => (
                  <tr key={p.id}>
                    <td>{p.symbol}</td>
                    <td>{p.side}</td>
                    <td>{fmtPrice(p.entryPrice, p.entryPrice)}</td>
                    <td>{fmtPrice(p.closePrice, p.closePrice)}</td>
                    <td className={pnlClass(p.realizedPnl)}>{fmtUsdt(p.realizedPnl)}</td>
                    <td>{p.closeReason || p.status}</td>
                    <td>{p.closedAt ? new Date(p.closedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {!posHistory.length && (
                  <tr><td colSpan={7} className="fut-empty">No closed positions.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editPos && (
        <div className="fut-modal-backdrop" onClick={() => setEditPos(null)}>
          <div className="fut-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Manage {editPos.symbol}</h3>
            <p className="fut-modal__sub">{editPos.side.toUpperCase()} · {fmtQty(editPos.quantity)} · {editPos.leverage}x</p>
            <label className="fut-field"><span>Take Profit</span><input value={editTp} onChange={(e) => setEditTp(e.target.value)} /></label>
            <label className="fut-field"><span>Stop Loss</span><input value={editSl} onChange={(e) => setEditSl(e.target.value)} /></label>
            <button type="button" className="fut-submit is-long" disabled={busy} onClick={saveTpSl}>Save TP/SL</button>
            <hr />
            <label className="fut-field"><span>Partial close size</span><input value={partialQty} onChange={(e) => setPartialQty(e.target.value)} placeholder={String(editPos.quantity)} /></label>
            <button type="button" className="fut-submit" disabled={busy} onClick={() => closePosition(editPos.id, partialQty || undefined)}>Close Position</button>
            <hr />
            <label className="fut-field"><span>Margin amount (USDT)</span><input value={marginAmt} onChange={(e) => setMarginAmt(e.target.value)} /></label>
            <div className="fut-confirm__actions">
              <button type="button" disabled={busy} onClick={() => adjustMargin('add')}>Add Margin</button>
              <button type="button" disabled={busy} onClick={() => adjustMargin('reduce')}>Reduce Margin</button>
            </div>
            <button type="button" className="fut-modal-close" onClick={() => setEditPos(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
