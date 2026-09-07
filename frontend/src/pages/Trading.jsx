import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, parseApiResponse, dashboardAPI, getApiErrorMessage } from '../api/client.js';
import { emitToast } from '../utils/toastBus.js';
import { acquireMarketSocket, releaseMarketSocket, getUserSocket } from '../services/appSocket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fmtINR } from '../utils/format.js';
import { useTradingPairs } from '../context/TradingPairsContext.jsx';
import { DEPTH_POLL_MS, TRADE_MARKET_POLL_MS, CLOCK_TICK_MS } from '../config/marketPoll.js';
import { formatLiveClock, formatMarketTime } from '../utils/timeFormat.js';
import { notifyWalletUpdated } from '../utils/walletEvents.js';
import { maxBuyQuantity, formatSpotQty } from '../utils/spotOrderMath.js';
import {
  readSwrSync,
  writeSwrSync,
  readSwrIdb,
  writeSwrIdb,
  SwrKeys,
} from '../utils/swrCache.js';
import CoinIcon from '../components/CoinIcon.jsx';
import './Trading.css';

const LiveChart = lazy(() => import('../components/LiveChart.jsx'));

const CHART_INTERVALS = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
];

/**
 * Instant pulse paint: close jumps to pulse price, high/low expand to show the spike.
 */
function applyPulseToLastCandle(prev, { price, from }) {
  const hi = Math.max(from, price);
  const lo = Math.min(from, price);
  if (!prev.length) {
    return [
      {
        openTime: Date.now(),
        open: from,
        high: hi,
        low: lo,
        close: price,
        volume: 1,
        pulse: true,
        _pulseZoom: true,
        _forceChart: true,
      },
    ];
  }
  const last = prev[prev.length - 1];
  const open = Number(last.open) > 0 ? Number(last.open) : from;
  return [
    ...prev.slice(0, -1),
    {
      ...last,
      open,
      high: Math.max(Number(last.high) || 0, hi, open, price),
      low: Math.min(Number(last.low) > 0 ? Number(last.low) : lo, lo, open, price),
      close: price,
      pulse: true,
      _pulseZoom: true,
      _forceChart: true,
    },
  ];
}

/**
 * Pulse ended: close returns to market, but KEEP pulse high/low wick so spike stays visible.
 * Live market graph continues from this close.
 */
function sealPulseKeepWick(candle, marketClose, wick) {
  const close = Number(marketClose);
  if (!(close > 0) || !candle) return candle;
  const open = Number(candle.open) > 0 ? Number(candle.open) : close;
  const high = Math.max(
    Number(candle.high) || 0,
    Number(wick?.high) || 0,
    open,
    close
  );
  const low = Math.min(
    Number(candle.low) > 0 ? Number(candle.low) : close,
    Number(wick?.low) > 0 ? Number(wick.low) : close,
    open,
    close
  );
  return {
    ...candle,
    open,
    high,
    low,
    close,
    pulse: false,
    _pulseZoom: false,
    _forceChart: true,
  };
}

/** Live tick after pulse: move close with market, never shrink pulse wick. */
function applyLiveCloseKeepWick(candle, livePrice) {
  const close = Number(livePrice);
  if (!(close > 0) || !candle) return candle;
  const open = Number(candle.open) > 0 ? Number(candle.open) : close;
  return {
    ...candle,
    open,
    high: Math.max(Number(candle.high) || 0, open, close),
    low: Math.min(Number(candle.low) > 0 ? Number(candle.low) : close, open, close),
    close,
    pulse: false,
  };
}

function fmtNum(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function fmtLocale(value, options) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, options) : '—';
}

function pairMeta(symbol, pairs) {
  return pairs.find((p) => p.symbol === symbol) || null;
}

function pairBase(symbol, pairs) {
  const row = pairMeta(symbol, pairs);
  if (row?.baseAsset) return row.baseAsset;
  const sym = String(symbol || '').toUpperCase();
  if (sym.endsWith('INR')) return sym.replace(/INR$/, '');
  return sym.replace(/USDT$/, '');
}

function pairQuote(symbol, pairs) {
  const row = pairMeta(symbol, pairs);
  if (row?.quoteAsset) return row.quoteAsset;
  const sym = String(symbol || '').toUpperCase();
  return sym.endsWith('INR') ? 'INR' : 'USDT';
}

function orderPairLabel(sym, pairs) {
  const meta = pairMeta(sym, pairs);
  return meta?.displayPair || `${pairBase(sym, pairs)}/${pairQuote(sym, pairs)}`;
}

function formatTradePrice(value, quoteAsset) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (quoteAsset === 'INR') return fmtINR(n);
  return fmtLocale(n, { maximumFractionDigits: n < 1 ? 6 : 4 });
}

function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function Trading() {
  const toast = useToast();
  const { user, token, loading: authLoading } = useAuth();
  const { toInr, usdtInrRate } = usePlatformConfig();
  const { pairs: tradingPairs, symbols: watchlistSymbols } = useTradingPairs();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loginReturn = { from: { pathname: '/trade' } };
  const [symbol, setSymbol] = useState(() => searchParams.get('symbol')?.toUpperCase() || 'BNBUSDT');
  const [marketTab, setMarketTab] = useState(() => {
    const s = searchParams.get('symbol')?.toUpperCase() || '';
    return s.endsWith('INR') ? 'INR' : 'USDT';
  });
  const [search, setSearch] = useState('');
  const [chartInterval, setChartInterval] = useState('4h');
  const [candles, setCandles] = useState([]);
  /** Bump to remount LiveChart after pulse so lightweight-charts is not stuck on old scale */
  const [chartEpoch, setChartEpoch] = useState(0);
  const [tableSearch, setTableSearch] = useState('');
  const [tablePageSize, setTablePageSize] = useState(10);
  const [orderStatusTab, setOrderStatusTab] = useState('pending');
  const [ordersRefreshTick, setOrdersRefreshTick] = useState(0);
  const [buyTable, setBuyTable] = useState({ rows: [], total: 0, totalPages: 1, page: 1, loading: false });
  const [sellTable, setSellTable] = useState({ rows: [], total: 0, totalPages: 1, page: 1, loading: false });
  const [ticker, setTicker] = useState(() => {
    const cached = readSwrSync(SwrKeys.livePrices);
    const pairs = cached?.data?.pairs;
    if (!Array.isArray(pairs)) return null;
    const sym = (searchParams.get('symbol')?.toUpperCase() || 'BNBUSDT');
    const row = pairs.find((p) => p.symbol === sym);
    if (!row) return null;
    return {
      symbol: row.symbol,
      lastPrice: row.price_inr ?? row.price,
      openPrice: row.open_24h,
      priceChangePercent: row.change_24h,
      priceChange: row.change_24h_abs,
      highPrice: row.high_24h,
      lowPrice: row.low_24h,
      volume: row.volume,
      quoteVolume: row.quoteVolume,
      stats_override: Boolean(row.stats_override),
    };
  });
  const [priceDir, setPriceDir] = useState('up');
  const prevPriceRef = useRef(null);
  const { wallet: balances, walletVersion, refreshWallet } = useRealtime();
  const [investedBalance, setInvestedBalance] = useState(
    () => Number(readSwrSync(SwrKeys.dashboardSummary)?.data?.stats?.total_staked ?? 0) || 0
  );
  const [depth, setDepth] = useState({ bids: [], asks: [], mid: null });
  const [tape, setTape] = useState([]);

  const [buyType, setBuyType] = useState('market');
  const [sellType, setSellType] = useState('market');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyQty, setBuyQty] = useState('0.01');
  const [sellQty, setSellQty] = useState('0.01');

  const [orderBusySide, setOrderBusySide] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [mobileView, setMobileView] = useState('chart');
  const [mobileOrderSide, setMobileOrderSide] = useState('buy');

  const [watchPrices, setWatchPrices] = useState(() => {
    const cached = readSwrSync(SwrKeys.livePrices);
    const pairs = cached?.data?.pairs;
    if (!Array.isArray(pairs)) return {};
    const bySym = {};
    for (const row of pairs) {
      if (!row?.symbol) continue;
      bySym[row.symbol] = {
        symbol: row.symbol,
        lastPrice: row.price_inr ?? row.price,
        openPrice: row.open_24h,
        priceChangePercent: row.change_24h,
        priceChange: row.change_24h_abs,
        highPrice: row.high_24h,
        lowPrice: row.low_24h,
        volume: row.volume,
        quoteVolume: row.quoteVolume,
        quoteAsset: row.quote_asset || (row.symbol.endsWith('INR') ? 'INR' : 'USDT'),
        stats_override: Boolean(row.stats_override),
        price_auto: row.price_auto !== false,
        price_manual: Boolean(row.price_manual),
      };
    }
    return bySym;
  });
  const [liveClock, setLiveClock] = useState(() => formatLiveClock());

  const debouncedTableSearch = useDebounced(tableSearch);

  const usdtBalance = Number(
    balances?.tradeable_balance ??
      balances?.available_balance ??
      balances?.main_available ??
      Math.max(0, Number(balances?.main_balance ?? 0))
  );

  const walletMain = Number(balances?.main_balance ?? 0);
  const walletReferral = Number(balances?.referral_balance ?? 0);
  const walletBonus = Number(balances?.bonus_balance ?? 0);
  const walletLocked = Number(balances?.locked_balance ?? 0);
  const walletWithdrawable = Number(
    balances?.withdrawable_balance ?? balances?.main_available ?? walletMain
  );
  const tradeAmount = Number(investedBalance) || 0;

  const base = pairBase(symbol, tradingPairs);
  const quoteAsset = pairQuote(symbol, tradingPairs);
  const isInrPair = quoteAsset === 'INR';
  const pairLabel = pairMeta(symbol, tradingPairs)?.displayPair || `${base}/${quoteAsset}`;
  const unitLabel = isInrPair ? (pairMeta(symbol, tradingPairs)?.unit || 'g') : base;
  const priceDigits = isInrPair ? 2 : Number(ticker?.lastPrice) < 1 ? 6 : 4;

  const baseBalance = useMemo(() => {
    const assets = balances?.assets || [];
    const row = assets.find((a) => a.asset === base);
    if (!row) return 0;
    return Number(row.balance ?? 0) - Number(row.locked_balance ?? 0);
  }, [balances, base]);

  const filteredList = useMemo(() => {
    const q = search.trim().toUpperCase();
    const suffix = marketTab === 'INR' ? 'INR' : 'USDT';
    // Prefer full pair catalog (active only) so newly added coins always appear
    const symbols = (tradingPairs || [])
      .filter((p) => p.isActive !== false && String(p.symbol || '').endsWith(suffix))
      .map((p) => String(p.symbol).toUpperCase());
    const list = symbols.length ? symbols : watchlistSymbols.filter((p) => p.endsWith(suffix));
    return list.filter((p) => !q || p.includes(q) || (pairMeta(p, tradingPairs)?.name || '').toUpperCase().includes(q));
  }, [search, watchlistSymbols, marketTab, tradingPairs]);

  useEffect(() => {
    const param = searchParams.get('symbol')?.toUpperCase();
    if (!param) return;
    // Accept URL symbol immediately; once catalog loads it will validate / stay selected
    setSymbol(param);
    setMarketTab(param.endsWith('INR') ? 'INR' : 'USDT');
  }, [searchParams]);

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

  const buyTotalUsdtHint = useMemo(() => {
    if (!isInrPair) return '';
    const inr = parseFloat(buyTotal);
    if (!Number.isFinite(inr) || !usdtInrRate) return '';
    return (inr / usdtInrRate).toFixed(2);
  }, [buyTotal, isInrPair, usdtInrRate]);

  const sellTotalUsdtHint = useMemo(() => {
    if (!isInrPair) return '';
    const inr = parseFloat(sellTotal);
    if (!Number.isFinite(inr) || !usdtInrRate) return '';
    return (inr / usdtInrRate).toFixed(2);
  }, [sellTotal, isInrPair, usdtInrRate]);

  useEffect(() => {
    if (isInrPair) {
      setBuyQty('1');
      setSellQty('1');
    }
  }, [symbol, isInrPair]);

  const loadLivePrices = useCallback(async () => {
    const { data } = await api.get('/market/prices/live');
    const payload = parseApiResponse(data);
    const pairs = payload?.pairs || [];
    writeSwrSync(SwrKeys.livePrices, { pairs, updatedAt: payload?.updatedAt });
    const bySym = {};

    for (const row of pairs) {
      if (!row?.symbol) continue;
      const lastPrice = row.price_inr ?? row.price;
      bySym[row.symbol] = {
        symbol: row.symbol,
        lastPrice,
        openPrice: row.open_24h,
        priceChangePercent: row.change_24h,
        priceChange: row.change_24h_abs,
        highPrice: row.high_24h,
        lowPrice: row.low_24h,
        volume: row.volume,
        quoteVolume: row.quoteVolume,
        quoteAsset: row.quote_asset || (row.symbol.endsWith('INR') ? 'INR' : 'USDT'),
        stats_override: Boolean(row.stats_override),
        price_auto: row.price_auto !== false,
        price_manual: Boolean(row.price_manual),
      };
    }

    setWatchPrices(bySym);

    const sym = symbol.toUpperCase();
    const active = bySym[sym];
    if (active) {
      const isManual = Boolean(active.price_manual || active.price_auto === false);
      priceManualRef.current = isManual;
      manualLastPriceRef.current = isManual ? active.lastPrice : null;
      setTicker((prev) => ({ ...prev, ...active }));
      setBuyPrice((p) => p || String(active.lastPrice ?? ''));
      setSellPrice((p) => p || String(active.lastPrice ?? ''));
    }
  }, [symbol]);

  useEffect(() => {
    setBuyPrice('');
    setSellPrice('');
    priceManualRef.current = false;
    manualLastPriceRef.current = null;
  }, [symbol]);

  // Market orders always show the live price (clears any Limit-entered value on switch)
  useEffect(() => {
    const p = ticker?.lastPrice;
    if (p == null || p === '') return;
    const str = String(p);
    if (buyType === 'market') setBuyPrice(str);
    if (sellType === 'market') setSellPrice(str);
  }, [ticker?.lastPrice, buyType, sellType]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await loadLivePrices();
      } catch {
        // Fallback: single-symbol ticker so refresh storms still paint Last Price
        try {
          const { data } = await api.get('/market/ticker', { params: { symbol } });
          if (!active) return;
          const t = parseApiResponse(data);
          if (t?.lastPrice || t?.price) {
            const isManual = Boolean(t.price_manual || t.price_auto === false);
            priceManualRef.current = isManual;
            manualLastPriceRef.current = isManual ? (t.lastPrice ?? t.price) : null;
            setTicker((prev) => ({
              ...prev,
              symbol: String(symbol).toUpperCase(),
              lastPrice: t.lastPrice ?? t.price,
              priceChangePercent: t.priceChangePercent ?? t.change_24h,
              highPrice: t.highPrice ?? t.high_24h,
              lowPrice: t.lowPrice ?? t.low_24h,
              quoteVolume: t.quoteVolume,
              volume: t.volume,
              stats_override: Boolean(t.stats_override),
              price_auto: t.price_auto !== false,
              price_manual: Boolean(t.price_manual),
            }));
          }
        } catch {
          /* keep previous ticker */
        }
      }
    }

    load();
    const id = setInterval(() => load(), TRADE_MARKET_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [loadLivePrices, symbol]);

  useEffect(() => {
    setLiveClock(formatLiveClock());
    const id = setInterval(() => setLiveClock(formatLiveClock()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const socketRef = useRef(null);
  /** Brief lock so live ticks keep the pulse wick while mid is pulsed */
  const pulseLockRef = useRef(null);
  /** Remember pulse high/low so wick stays after pulse ends */
  const pulseWickRef = useRef(null);
  /** When admin turned Auto off — block live socket ticks from overwriting manual price */
  const priceManualRef = useRef(false);
  const manualLastPriceRef = useRef(null);

  useEffect(() => {
    // Instant clear so previous coin never flashes on switch
    setCandles([]);
    setDepth({ bids: [], asks: [], mid: null });
    setTape([]);
    setTicker(null);
    pulseLockRef.current = null;
    pulseWickRef.current = null;
    setChartEpoch((n) => n + 1);
    setChartInterval('4h');
  }, [symbol]);

  useEffect(() => {
    let active = true;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const requestSymbol = String(symbol).toUpperCase();
    const cacheKey = SwrKeys.klines(requestSymbol, chartInterval);
    pulseWickRef.current = null;
    pulseLockRef.current = null;

    readSwrIdb(cacheKey).then((cached) => {
      if (!active || !Array.isArray(cached?.data) || !cached.data.length) return;
      setCandles((prev) => (prev.length ? prev : cached.data));
    });

    (async () => {
      try {
        const { data } = await api.get('/market/klines', {
          params: { symbol: requestSymbol, interval: chartInterval, limit: 200 },
          signal: ctrl?.signal,
        });
        if (!active) return;
        const klines = parseApiResponse(data);
        const rows = klines?.candles || [];
        if (rows.length) {
          setCandles(rows);
          writeSwrIdb(cacheKey, rows);
        }
      } catch (err) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        /* keep empty until live socket paints */
      }
    })();
    return () => {
      active = false;
      ctrl?.abort();
    };
  }, [symbol, chartInterval]);

  const refreshBalance = refreshWallet;

  const refreshInvestedBalance = useCallback(async () => {
    try {
      const summary = await dashboardAPI.getSummary();
      writeSwrSync(SwrKeys.dashboardSummary, summary);
      setInvestedBalance(Number(summary?.stats?.total_staked ?? 0));
    } catch {
      setInvestedBalance(0);
    }
  }, []);

  useEffect(() => {
    const socket = acquireMarketSocket();
    socketRef.current = socket;
    return () => {
      releaseMarketSocket();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;

    const sym = symbol.toUpperCase();

    const pulseActive = () => {
      const lock = pulseLockRef.current;
      return Boolean(lock?.active && Date.now() <= lock.until);
    };

    const canApplyLiveTick = () => !priceManualRef.current || pulseActive();

    const subscribe = () => {
      socket.emit('market:subscribe', { symbol: sym, interval: chartInterval });
      if (chartInterval !== '1s') {
        socket.emit('market:subscribe', { symbol: sym, interval: '1s' });
      }
    };

    /** Merge pulse wick into a candle without forcing full chart redraw */
    const withPulseWick = (candle, lock, { zoomOnce = false } = {}) => {
      if (!lock?.active || Date.now() > lock.until) return candle;
      const open = Number(candle.open) || lock.from;
      const close = lock.price;
      return {
        ...candle,
        open,
        high: Math.max(open, close, lock.high, Number(candle.high) || 0),
        low: Math.min(open, close, lock.low, Number(candle.low) || close),
        close,
        pulse: true,
        ...(zoomOnce ? { _pulseZoom: true } : {}),
      };
    };

    const onMerged = (payload) => {
      if (!payload?.candle || payload.symbol !== sym || payload.interval !== chartInterval) return;
      let lock = pulseLockRef.current;
      let c = { ...payload.candle, pulse: Boolean(payload.candle.pulse) };

      // Pulse candle may arrive before market:price:pulse — arm lock from candle itself
      if (c.pulse && Number(c.close) > 0 && !(lock?.active && Date.now() <= lock.until)) {
        const from = Number(c.open) > 0 ? Number(c.open) : Number(c.close);
        const price = Number(c.close);
        lock = {
          price,
          from,
          high: Math.max(from, price, Number(c.high) || price),
          low: Math.min(from, price, Number(c.low) > 0 ? Number(c.low) : price),
          until: Date.now() + 4500,
          active: true,
        };
        pulseLockRef.current = lock;
        pulseWickRef.current = { high: lock.high, low: lock.low };
      }

      if (lock?.active && Date.now() <= lock.until) {
        c = withPulseWick(c, lock, { zoomOnce: true });
      } else if (lock) {
        pulseLockRef.current = null;
      }

      setCandles((prev) => {
        if (!prev.length) {
          return [{ ...c, _forceChart: true, _pulseZoom: Boolean(c.pulse) }];
        }

        // 1) Active pulse → instant spike on last candle
        if (lock?.active && Date.now() <= lock.until) {
          return applyPulseToLastCandle(prev, { price: lock.price, from: lock.from });
        }

        const last = prev[prev.length - 1];
        const sameBucket = Number(c.openTime) === Number(last.openTime);
        const liveClose = Number(c.close);

        if (sameBucket && liveClose > 0) {
          // 2) After pulse: market close continues, pulse wick stays
          const sealed = sealPulseKeepWick(last, liveClose, pulseWickRef.current);
          return [...prev.slice(0, -1), sealed];
        }
        if (Number(c.openTime) > Number(last.openTime)) {
          // New bucket — clear wick memory for next bar
          pulseWickRef.current = null;
          return [...prev.slice(-499), applyLiveCloseKeepWick(c, liveClose)];
        }
        const idx = prev.findIndex((x) => Number(x.openTime) === Number(c.openTime));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] =
            idx === prev.length - 1
              ? sealPulseKeepWick(prev[idx], liveClose, pulseWickRef.current)
              : { ...c, pulse: false };
          return next;
        }
        return prev;
      });

      const displayPrice = lock?.active && Date.now() <= lock.until ? lock.price : Number(c.close);
      if (displayPrice > 0 && canApplyLiveTick()) {
        setTicker((prev) => ({ ...prev, lastPrice: displayPrice, symbol: sym }));
        setWatchPrices((prev) => ({
          ...prev,
          [sym]: { ...(prev[sym] || { symbol: sym }), lastPrice: displayPrice },
        }));
      }
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
        pulse: Boolean(payload.pulse),
      });
    };

    const onPulse = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      const price = Number(payload.effectivePrice ?? payload.price);
      if (!(price > 0)) return;
      const from = Number(payload.fromPrice) || price;
      const hi = Math.max(from, price);
      const lo = Math.min(from, price);
      const until = Number(payload.until) || Date.now() + 4500;

      pulseLockRef.current = {
        price,
        from,
        high: hi,
        low: lo,
        until,
        active: true,
      };
      // Keep wick forever on this candle after pulse ends
      pulseWickRef.current = {
        high: hi,
        low: lo,
        pulsedPrice: price,
        fromPrice: from,
      };

      // Instant UI: last price + chart line jump to pulse NOW
      // Also expand 24h high/low so pulsed extreme shows in the header
      const headerHigh = Number(payload.high_24h);
      const headerLow = Number(payload.low_24h);
      setTicker((prev) => {
        const prevHigh = Number(prev?.highPrice);
        const prevLow = Number(prev?.lowPrice);
        const nextHigh = Number.isFinite(headerHigh) && headerHigh > 0
          ? headerHigh
          : Number.isFinite(prevHigh) && prevHigh > 0
            ? Math.max(prevHigh, price, from)
            : Math.max(price, from);
        const nextLow = Number.isFinite(headerLow) && headerLow > 0
          ? headerLow
          : Number.isFinite(prevLow) && prevLow > 0
            ? Math.min(prevLow, price, from)
            : Math.min(price, from);
        return {
          ...prev,
          lastPrice: price,
          symbol: sym,
          highPrice: nextHigh,
          lowPrice: nextLow,
          stats_override: true,
        };
      });
      setWatchPrices((prev) => ({
        ...prev,
        [sym]: { ...(prev[sym] || { symbol: sym }), lastPrice: price },
      }));
      setCandles((prev) => applyPulseToLastCandle(prev, { price, from }));
    };

    const onPulseEnd = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      const marketPrice = Number(payload.price);
      const pulsedPrice = Number(payload.pulsedPrice);
      const wickFromPayload = {
        high: Number(payload.high) || Math.max(marketPrice || 0, pulsedPrice || 0),
        low: Number(payload.low) || Math.min(marketPrice || Infinity, pulsedPrice || Infinity),
      };
      const wick = pulseWickRef.current || wickFromPayload;
      if (pulsedPrice > 0) {
        pulseWickRef.current = {
          high: Math.max(wick.high || 0, pulsedPrice, marketPrice || 0),
          low: Math.min(
            wick.low > 0 ? wick.low : pulsedPrice,
            pulsedPrice,
            marketPrice > 0 ? marketPrice : pulsedPrice
          ),
          pulsedPrice,
        };
      }
      pulseLockRef.current = null;

      const restorePrice =
        priceManualRef.current && manualLastPriceRef.current != null
          ? Number(manualLastPriceRef.current)
          : marketPrice;

      if (restorePrice > 0) {
        const headerHigh = Number(payload.high_24h);
        const headerLow = Number(payload.low_24h);
        setTicker((prev) => {
          const prevHigh = Number(prev?.highPrice);
          const prevLow = Number(prev?.lowPrice);
          const nextHigh = Number.isFinite(headerHigh) && headerHigh > 0
            ? headerHigh
            : Number.isFinite(prevHigh) && prevHigh > 0
              ? Math.max(prevHigh, pulsedPrice || 0, restorePrice)
              : prevHigh;
          const nextLow = Number.isFinite(headerLow) && headerLow > 0
            ? headerLow
            : Number.isFinite(prevLow) && prevLow > 0
              ? Math.min(prevLow, pulsedPrice > 0 ? pulsedPrice : prevLow, restorePrice)
              : prevLow;
          return {
            ...prev,
            lastPrice: restorePrice,
            symbol: sym,
            highPrice: nextHigh,
            lowPrice: nextLow,
            stats_override: true,
          };
        });
        setWatchPrices((prev) => ({
          ...prev,
          [sym]: { ...(prev[sym] || { symbol: sym }), lastPrice: restorePrice },
        }));
        setCandles((prev) => {
          if (!prev.length) return prev;
          return [
            ...prev.slice(0, -1),
            sealPulseKeepWick(prev[prev.length - 1], restorePrice, pulseWickRef.current),
          ];
        });
      }
      setDepth((prev) => ({ ...prev, pulse: false }));
    };

    const onTrade = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      const lock = pulseLockRef.current;
      const price =
        lock?.active && Date.now() < lock.until ? lock.price : Number(payload.price);
      if (!canApplyLiveTick()) return;
      setTicker((prev) => ({ ...prev, lastPrice: price, symbol: sym }));
      setWatchPrices((prev) => ({
        ...prev,
        [sym]: {
          ...(prev[sym] || { symbol: sym }),
          lastPrice: price,
        },
      }));

      // After pulse: live market continues designing the graph; wick stays
      if (!(lock?.active && Date.now() <= lock.until) && Number(price) > 0 && !payload.pulse) {
        setCandles((prev) => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          const withWick = sealPulseKeepWick(last, price, pulseWickRef.current);
          return [...prev.slice(0, -1), withWick];
        });
      }

      if (!payload.tickerOnly) {
        setTape((prev) => {
          const next = [{ ...payload, symbol: sym, _id: `${payload.time}-${Math.random()}` }, ...prev];
          return next.slice(0, 50);
        });
        if (user && payload.pulse) refreshBalance().catch(() => {});
      }
    };

    const onOrdersFilled = (payload) => {
      if (!payload || payload.symbol !== sym) return;
      if (!user) return;
      refreshBalance().catch(() => {});
      setOrdersRefreshTick((n) => n + 1);
    };

    socket.on('market:klines:merged', onMerged);
    socket.on('market:manual:updated', onManual);
    socket.on('market:depth', onDepth);
    socket.on('market:trade', onTrade);
    socket.on('market:price:pulse', onPulse);
    socket.on('market:price:pulse:end', onPulseEnd);
    socket.on('market:orders:filled', onOrdersFilled);
    socket.on('connect', subscribe);
    if (socket.connected) subscribe();
    else socket.connect();

    return () => {
      socket.emit('market:unsubscribe', { symbol: sym, interval: chartInterval });
      if (chartInterval !== '1s') {
        socket.emit('market:unsubscribe', { symbol: sym, interval: '1s' });
      }
      socket.off('connect', subscribe);
      socket.off('market:klines:merged', onMerged);
      socket.off('market:manual:updated', onManual);
      socket.off('market:depth', onDepth);
      socket.off('market:trade', onTrade);
      socket.off('market:price:pulse', onPulse);
      socket.off('market:price:pulse:end', onPulseEnd);
      socket.off('market:orders:filled', onOrdersFilled);
      pulseLockRef.current = null;
    };
  }, [symbol, chartInterval, refreshBalance, user]);

  // REST fallback for order book — only when socket has been quiet
  useEffect(() => {
    const sym = symbol.toUpperCase();
    let active = true;
    let lastSocketDepthAt = 0;

    const onSocketDepth = (payload) => {
      if (payload?.symbol === sym) lastSocketDepthAt = Date.now();
    };
    const socket = socketRef.current;
    socket?.on('market:depth', onSocketDepth);

    async function loadDepth() {
      try {
        // Prefer live socket depth — skip REST if we got a socket update recently
        if (Date.now() - lastSocketDepthAt < 5_000) return;
        const { data } = await api.get('/market/depth', { params: { symbol: sym, limit: 20 } });
        if (!active) return;
        const payload = parseApiResponse(data);
        if (!payload || payload.symbol !== sym) return;
        setDepth((prev) => {
          // Only keep pulse book while pulse is active; otherwise accept market depth
          if (prev.pulse && !payload.pulse && Date.now() - lastSocketDepthAt < 800) {
            return prev;
          }
          const next = {
            bids: payload.bids || [],
            asks: payload.asks || [],
            mid: payload.mid ?? prev.mid,
            pulse: Boolean(payload.pulse),
          };
          if (!next.bids.length && !next.asks.length) return prev;
          return next;
        });
      } catch {
        /* keep socket data if REST fails */
      }
    }

    loadDepth();
    const id = setInterval(loadDepth, DEPTH_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
      socket?.off('market:depth', onSocketDepth);
    };
  }, [symbol]);

  const fetchSideOrders = useCallback(
    async (side, page) => {
      const params = {
        page,
        pageSize: tablePageSize,
        sortBy: 'createdAt',
        sortDir: 'desc',
        side,
      };
      if (debouncedTableSearch) params.search = debouncedTableSearch;

      if (orderStatusTab === 'history') {
        const { data } = await api.get('/orders/trades', { params });
        const payload = parseApiResponse(data);
        return {
          rows: payload?.rows || [],
          total: payload?.total || 0,
          totalPages: payload?.totalPages || 1,
          page,
          loading: false,
        };
      }
      const { data } = await api.get('/orders', {
        params: { ...params, status: orderStatusTab },
      });
      const payload = parseApiResponse(data);
      return {
        rows: payload?.rows || [],
        total: payload?.total || 0,
        totalPages: payload?.totalPages || 1,
        page,
        loading: false,
      };
    },
    [tablePageSize, debouncedTableSearch, orderStatusTab]
  );

  const fetchTableData = useCallback(async () => {
    if (!user) {
      setBuyTable({ rows: [], total: 0, totalPages: 1, page: 1, loading: false });
      setSellTable({ rows: [], total: 0, totalPages: 1, page: 1, loading: false });
      return;
    }
    setBuyTable((t) => ({ ...t, loading: true }));
    setSellTable((t) => ({ ...t, loading: true }));
    const empty = { rows: [], total: 0, totalPages: 1, page: 1, loading: false };
    const [buyRes, sellRes] = await Promise.all([
      fetchSideOrders('buy', buyTable.page).catch(() => ({ ...empty, page: buyTable.page })),
      fetchSideOrders('sell', sellTable.page).catch(() => ({ ...empty, page: sellTable.page })),
    ]);
    setBuyTable(buyRes);
    setSellTable(sellRes);
  }, [user, buyTable.page, sellTable.page, fetchSideOrders]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData, ordersRefreshTick]);

  useEffect(() => {
    if (!user || !token) return undefined;
    const socket = getUserSocket(token);

    const applyOrderUpdate = (payload) => {
      const order = payload?.order ?? payload;
      if (!order?.side) {
        setOrdersRefreshTick((n) => n + 1);
        return;
      }
      const side = order.side;
      const setter = side === 'buy' ? setBuyTable : setSellTable;
      const terminal = ['filled', 'cancelled', 'rejected'].includes(order.status);
      const isPendingView = orderStatusTab === 'pending';

      if (terminal && isPendingView) {
        setter((t) => ({
          ...t,
          rows: t.rows.filter(
            (r) => String(r.id) !== String(order.id) && r._tempId !== order.id
          ),
          loading: false,
        }));
        if (order.status === 'filled') {
          setOrdersRefreshTick((n) => n + 1);
        }
        return;
      }

      if (!terminal && isPendingView) {
        setter((t) => ({
          ...t,
          rows: [
            { ...order, _optimistic: false },
            ...t.rows.filter(
              (r) => String(r.id) !== String(order.id) && r._tempId !== order.id
            ),
          ],
          loading: false,
        }));
        return;
      }

      if (terminal && !isPendingView) {
        setter((t) => ({
          ...t,
          rows: [
            { ...order, _optimistic: false },
            ...t.rows.filter((r) => String(r.id) !== String(order.id)),
          ],
          loading: false,
        }));
      }
    };

    socket.on('orders:update', applyOrderUpdate);
    const onLocal = () => setOrdersRefreshTick((n) => n + 1);
    window.addEventListener('orders:updated', onLocal);
    return () => {
      socket.off('orders:update', applyOrderUpdate);
      window.removeEventListener('orders:updated', onLocal);
    };
  }, [user, token, orderStatusTab]);

  useEffect(() => {
    setBuyTable((t) => (t.page === 1 ? t : { ...t, page: 1 }));
    setSellTable((t) => (t.page === 1 ? t : { ...t, page: 1 }));
  }, [debouncedTableSearch, orderStatusTab, tablePageSize]);

  useEffect(() => {
    if (!user) {
      setInvestedBalance(0);
      return undefined;
    }
    refreshInvestedBalance().catch(() => {});
  }, [refreshInvestedBalance, user, walletVersion]);

  function requireLogin() {
    navigate('/login', { state: loginReturn });
  }

  function upsertOptimisticOrder(side, row) {
    const setter = side === 'buy' ? setBuyTable : setSellTable;
    setter((t) => ({
      ...t,
      rows: [
        row,
        ...t.rows.filter((r) => r.id !== row.id && r._tempId !== row._tempId),
      ],
      total: orderStatusTab === 'pending' ? Math.max(t.total, t.rows.length) + 1 : t.total,
      loading: false,
    }));
  }

  function mergeOrderResult(side, tempId, result) {
    const setter = side === 'buy' ? setBuyTable : setSellTable;
    setter((t) => {
      const rows = t.rows.map((r) =>
        r._tempId === tempId || r.id === tempId ? { ...result, _optimistic: false } : r
      );
      const has = rows.some((r) => String(r.id) === String(result.id));
      return {
        ...t,
        rows: has ? rows : [result, ...rows.filter((r) => r._tempId !== tempId)],
        loading: false,
      };
    });
  }

  function canCancelOrder(order) {
    if (!order || order._optimistic) return false;
    const id = order.id || order._id;
    if (!id || String(id).startsWith('opt-')) return false;
    return ['open', 'partially_filled'].includes(String(order.status || '').toLowerCase());
  }

  async function cancelOpenOrder(order, side) {
    const orderId = order.id || order._id;
    if (!orderId || cancellingOrderId) return;
    setCancellingOrderId(String(orderId));
    const setter = side === 'buy' ? setBuyTable : setSellTable;
    setter((t) => ({
      ...t,
      rows: t.rows.filter((r) => String(r.id || r._id) !== String(orderId)),
      total: Math.max(0, t.total - 1),
    }));
    try {
      const { data } = await api.post(`/orders/${orderId}/cancel`);
      const result = parseApiResponse(data);
      emitToast({ type: 'success', message: data?.message || 'Order cancelled' });
      if (result?.wallet) notifyWalletUpdated(result.wallet);
      else void refreshWallet();
      window.dispatchEvent(new CustomEvent('orders:updated'));
    } catch (err) {
      emitToast({ type: 'error', message: getApiErrorMessage(err) });
      setOrdersRefreshTick((n) => n + 1);
    } finally {
      setCancellingOrderId(null);
    }
  }

  async function resolveSubmitQuantity(side, orderType, requestedQty, priceRaw) {
    if (!(requestedQty > 0)) return 0;
    if (side === 'buy') {
      try {
        const { data } = await api.get('/orders/max-buy', {
          params: {
            symbol,
            orderType,
            ...(orderType === 'limit' ? { price: parseFloat(priceRaw) } : {}),
          },
        });
        const payload = parseApiResponse(data);
        const maxQty = Number(payload?.quantity);
        if (!(maxQty > 0)) return 0;
        return Math.min(requestedQty, maxQty);
      } catch {
        const price =
          orderType === 'market' ? Number(ticker?.lastPrice) : parseFloat(priceRaw);
        const maxLocal = maxBuyQuantity(usdtBalance, price, { isInrPair, usdtInrRate, marketBuffer: 1 });
        if (!(maxLocal > 0)) return 0;
        return Math.min(requestedQty, maxLocal);
      }
    }
    if (side === 'sell') {
      const maxSell = Math.floor(baseBalance * 1e8) / 1e8;
      if (!(maxSell > 0)) return 0;
      return Math.min(requestedQty, maxSell);
    }
    return requestedQty;
  }

  async function place(side, orderType) {
    if (!user) {
      requireLogin();
      return;
    }
    if (orderBusySide === side) return;
    const priceRaw = side === 'buy' ? buyPrice : sellPrice;
    let qty = parseFloat(side === 'buy' ? buyQty : sellQty);
    if (!(qty > 0)) {
      toast.warning('Enter a valid quantity greater than zero.');
      return;
    }
    const originalQty = qty;
    qty = await resolveSubmitQuantity(side, orderType, qty, priceRaw);
    if (!(qty > 0)) {
      toast.warning(
        side === 'buy'
          ? 'Not enough USDT balance at the current price.'
          : `Insufficient ${base} balance.`
      );
      return;
    }
    if (qty + 1e-12 < originalQty) {
      const qtyStr = formatSpotQty(qty);
      if (side === 'buy') setBuyQty(qtyStr);
      else setSellQty(qtyStr);
      toast.info(`Price moved — quantity adjusted to ${qtyStr} to match your balance.`);
    }
    if (side === 'sell' && qty > baseBalance + 1e-12) {
      toast.warning(`Insufficient ${base} balance. You have ${baseBalance.toFixed(8)} ${base}.`);
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
    const tempId = `opt-${Date.now()}`;
    if (orderStatusTab === 'pending') {
      upsertOptimisticOrder(side, {
        _tempId: tempId,
        id: tempId,
        symbol,
        side,
        orderType,
        quantity: qty,
        price: payload.price,
        status: 'open',
        createdAt: new Date().toISOString(),
        _optimistic: true,
      });
    }
    setOrderBusySide(side);
    try {
      const { data } = await api.post('/orders', payload);
      const result = parseApiResponse(data);
      if (result?.status === 'rejected') {
        emitToast({ type: 'error', message: data?.message || 'Order rejected (insufficient balance)' });
      } else if (result?.quantity_adjusted) {
        emitToast({ type: 'info', message: data?.message || 'Quantity adjusted to match your balance.' });
      } else if (result?.status === 'filled') {
        emitToast({ type: 'success', message: data?.message || 'Order filled' });
      } else {
        emitToast({ type: 'success', message: data?.message || 'Order placed' });
      }
      if (result) {
        mergeOrderResult(side, tempId, result);
        if (result.status === 'filled' && orderStatusTab === 'pending') {
          const setter = side === 'buy' ? setBuyTable : setSellTable;
          setter((t) => ({
            ...t,
            rows: t.rows.filter((r) => r._tempId !== tempId && String(r.id) !== String(result.id)),
          }));
        }
      }
      if (result?.wallet) {
        notifyWalletUpdated(result.wallet);
      } else {
        void refreshWallet();
      }
      window.dispatchEvent(new CustomEvent('orders:updated'));
    } catch (err) {
      emitToast({ type: 'error', message: getApiErrorMessage(err) });
      setOrdersRefreshTick((n) => n + 1);
    } finally {
      setOrderBusySide(null);
    }
  }

  function fillFromBook(row, bookSide) {
    const price = Number(row?.price);
    const qty = Number(row?.qty);
    if (Number.isFinite(price) && price > 0) {
      const priceStr = String(price);
      setBuyPrice(priceStr);
      setSellPrice(priceStr);
      if (buyType === 'market') setBuyType('limit');
      if (sellType === 'market') setSellType('limit');
    }
    if (Number.isFinite(qty) && qty > 0) {
      const qtyStr = String(qty);
      if (bookSide === 'ask') {
        // Clicking sell wall → fill buy amount
        setBuyQty(qtyStr);
        setMobileOrderSide('buy');
      } else {
        // Clicking buy wall → fill sell amount
        setSellQty(qtyStr);
        setMobileOrderSide('sell');
      }
    }
  }

  async function fillBuyMax() {
    const price = buyType === 'market' ? Number(ticker?.lastPrice) : parseFloat(buyPrice);
    if (!(usdtBalance > 0)) {
      toast.warning('No USDT balance available.');
      return;
    }
    if (!(price > 0)) {
      toast.warning('Set a price first (or wait for market price).');
      return;
    }
    try {
      const { data } = await api.get('/orders/max-buy', {
        params: {
          symbol,
          orderType: buyType,
          ...(buyType === 'limit' ? { price } : {}),
        },
      });
      const payload = parseApiResponse(data);
      const qty = Number(payload?.quantity);
      if (qty > 0) {
        setBuyQty(formatSpotQty(qty));
        return;
      }
    } catch {
      /* fall back to client-side estimate */
    }
    const maxQty = maxBuyQuantity(usdtBalance, price, {
      isInrPair,
      usdtInrRate,
      marketBuffer: buyType === 'market' ? 1.002 : 1,
    });
    if (maxQty > 0) {
      setBuyQty(formatSpotQty(maxQty));
      return;
    }
    toast.warning('Not enough balance for a trade at this price.');
  }

  function fillSellMax() {
    if (!(baseBalance > 0)) {
      toast.warning(`No ${base} balance available.`);
      return;
    }
    setSellQty(formatSpotQty(Math.floor(baseBalance * 1e8) / 1e8));
  }

  useEffect(() => {
    prevPriceRef.current = null;
    setPriceDir('up');
  }, [symbol]);

  useEffect(() => {
    const p = Number(ticker?.lastPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    const prev = prevPriceRef.current;
    if (prev != null && p !== prev) {
      setPriceDir(p > prev ? 'up' : 'down');
    }
    prevPriceRef.current = p;
  }, [ticker?.lastPrice]);

  const lastNum = Number(ticker?.lastPrice);
  const openNum = Number(ticker?.openPrice);
  const statsOverride = Boolean(ticker?.stats_override || ticker?.price_manual);
  const hasLiveChange =
    !statsOverride && Number.isFinite(openNum) && openNum > 0 && Number.isFinite(lastNum);
  const changePct = hasLiveChange
    ? ((lastNum - openNum) / openNum) * 100
    : Number(ticker?.priceChangePercent ?? 0);
  const changeAbs = hasLiveChange
    ? lastNum - openNum
    : Number(ticker?.priceChange ?? NaN);
  const changeUp = changePct >= 0;
  const priceUp = priceDir !== 'down';
  const high24h =
    statsOverride && Number.isFinite(Number(ticker?.highPrice))
      ? Number(ticker.highPrice)
      : Number.isFinite(lastNum)
        ? Math.max(Number(ticker?.highPrice) || lastNum, lastNum)
        : Number(ticker?.highPrice);
  const low24h =
    statsOverride && Number.isFinite(Number(ticker?.lowPrice))
      ? Number(ticker.lowPrice)
      : Number.isFinite(lastNum)
        ? Math.min(Number(ticker?.lowPrice) || lastNum, lastNum)
        : Number(ticker?.lowPrice);
  const quoteVol = Number.isFinite(Number(ticker?.quoteVolume))
    ? Number(ticker.quoteVolume)
    : Number(ticker?.volume) * (Number.isFinite(lastNum) ? lastNum : 0);

  function orderDisplayPrice(o) {
    const q = pairQuote(o.symbol, tradingPairs);
    if (o.avgFillPrice != null && Number.isFinite(Number(o.avgFillPrice))) {
      return formatTradePrice(o.avgFillPrice, q);
    }
    if (o.price != null) return formatTradePrice(o.price, q);
    return 'Market';
  }

  function orderDisplayTotal(o) {
    const p = o.avgFillPrice ?? o.price;
    const q = pairQuote(o.symbol, tradingPairs);
    if (p != null && o.quantity) {
      const total = Number(p) * Number(o.quantity);
      return q === 'INR' ? fmtINR(total) : total.toFixed(2);
    }
    return '—';
  }

  function selectSymbol(next) {
    setSymbol(next);
    setSearchParams({ symbol: next }, { replace: true });
    if (next.endsWith('INR')) setMarketTab('INR');
    else if (next.endsWith('USDT')) setMarketTab('USDT');
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setMobileView('chart');
    }
  }

  function pageRange(table) {
    if (!table.total) return { from: 0, to: 0 };
    const from = (table.page - 1) * tablePageSize + 1;
    const to = Math.min(table.page * tablePageSize, table.total);
    return { from, to };
  }

  function renderOrderSideCard(side, table, setPage) {
    const isBuy = side === 'buy';
    const { from, to } = pageRange(table);
    const emptyLabel =
      orderStatusTab === 'history'
        ? `No ${side} trade history yet.`
        : `No ${orderStatusTab} ${side} orders.`;

    return (
      <div className={`ex-my-orders__card ex-my-orders__card--${side}`}>
        <div className="ex-my-orders__card-head">
          <h3>{isBuy ? 'Buy orders' : 'Sell orders'}</h3>
          <span className="ex-my-orders__card-count">
            {table.total} {table.total === 1 ? 'order' : 'orders'}
          </span>
        </div>
        <div className="ex-my-orders__scroll">
          {table.loading ? (
            <div className="ex-my-orders__loading">Loading…</div>
          ) : orderStatusTab === 'history' ? (
            <div className="ex-my-orders__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Price</th>
                    <th>Amount</th>
                    <th>Total</th>
                    <th>Fee</th>
                    <th>Date &amp; Time</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((t) => (
                    <tr key={t.id || t._id}>
                      <td>
                        <span className="ex-pair-cell">
                          <CoinIcon
                            symbol={String(t.symbol || '').replace(/USDT$|INR$/, '')}
                            imageUrl={pairMeta(t.symbol, tradingPairs)?.imageUrl}
                            coingeckoId={pairMeta(t.symbol, tradingPairs)?.coingeckoId}
                            type={String(t.symbol || '').endsWith('INR') ? 'commodity' : 'crypto'}
                            size={18}
                          />
                          {orderPairLabel(t.symbol, tradingPairs)}
                        </span>
                      </td>
                      <td>{formatTradePrice(t.price, pairQuote(t.symbol, tradingPairs))}</td>
                      <td>{t.quantity}</td>
                      <td>{t.total ?? fmtNum(Number(t.price) * Number(t.quantity), 2)}</td>
                      <td>{t.fee != null ? fmtNum(t.fee, 4) : '—'}</td>
                      <td>{t.createdAt ? formatMarketTime(t.createdAt) : '—'}</td>
                    </tr>
                  ))}
                  {!table.rows.length && (
                    <tr>
                      <td colSpan={6} className="ex-empty-row">
                        {emptyLabel}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ex-my-orders__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Price</th>
                    <th>Amount</th>
                    <th>Total</th>
                    <th>Date &amp; Time</th>
                    <th>Status</th>
                    {orderStatusTab === 'pending' ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((o) => (
                    <tr key={o._id || o.id}>
                      <td>
                        <span className="ex-pair-cell">
                          <CoinIcon
                            symbol={String(o.symbol || '').replace(/USDT$|INR$/, '')}
                            imageUrl={pairMeta(o.symbol, tradingPairs)?.imageUrl}
                            coingeckoId={pairMeta(o.symbol, tradingPairs)?.coingeckoId}
                            type={String(o.symbol || '').endsWith('INR') ? 'commodity' : 'crypto'}
                            size={18}
                          />
                          {orderPairLabel(o.symbol, tradingPairs)}
                        </span>
                      </td>
                      <td>{orderDisplayPrice(o)}</td>
                      <td>{o.quantity}</td>
                      <td>{orderDisplayTotal(o)}</td>
                      <td>{o.createdAt ? formatMarketTime(o.createdAt) : '—'}</td>
                      <td>
                        <span className="ex-status-badge">{o.status}</span>
                      </td>
                      {orderStatusTab === 'pending' ? (
                        <td>
                          {canCancelOrder(o) ? (
                            <button
                              type="button"
                              className="ex-order-cancel-btn"
                              disabled={cancellingOrderId === String(o.id || o._id)}
                              onClick={() => cancelOpenOrder(o, side)}
                            >
                              {cancellingOrderId === String(o.id || o._id) ? 'Cancelling…' : 'Cancel'}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {!table.rows.length && (
                    <tr>
                      <td colSpan={orderStatusTab === 'pending' ? 7 : 6} className="ex-empty-row">
                        {emptyLabel}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!table.loading && table.total > 0 && (
          <div className="ex-my-orders__pagination">
            <span>
              Showing {from}–{to} of {table.total}
            </span>
            <div className="ex-my-orders__pagination-actions">
              <button type="button" disabled={table.page <= 1} onClick={() => setPage(table.page - 1)}>
                Previous
              </button>
              <span>
                Page {table.page} of {table.totalPages}
              </span>
              <button
                type="button"
                disabled={table.page >= table.totalPages}
                onClick={() => setPage(table.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`trading-page${mobileView === 'orders' ? ' trading-page--orders-view' : ''}`}>
      {/* {!authLoading && !user && (
        <div className="ex-guest-banner">
          <span>You are viewing live markets as a guest.</span>
          <Link to="/login" state={loginReturn}>Log in</Link>
          <span>or</span>
          <Link to="/signup">Sign up</Link>
          <span>to place orders.</span>
        </div>
      )} */}
      <div className="ex-ticker ex-ticker--scroll">
        <div className="ex-ticker__pair-wrap">
          <CoinIcon
            symbol={base}
            imageUrl={pairMeta(symbol, tradingPairs)?.imageUrl}
            coingeckoId={pairMeta(symbol, tradingPairs)?.coingeckoId}
            type={isInrPair ? 'commodity' : 'crypto'}
            name={pairMeta(symbol, tradingPairs)?.name}
            size={28}
          />
          <span className="ex-ticker__pair">{pairLabel}{isInrPair ? ' · per g' : ''}</span>
        </div>

        <div className="ex-ticker__stats">
          <div className="ex-ticker__stat-block ex-ticker__stat-block--price">
          <span className="ex-ticker__stat-label">Last Price</span>
          <span className={`ex-ticker__price ${priceUp ? 'ex-ticker__price--up' : 'ex-ticker__price--down'}`}>
            {ticker ? formatTradePrice(ticker.lastPrice, quoteAsset) : '—'}
          </span>
          </div>

          <div className={`ex-ticker__stat-block ${changeUp ? 'ex-ticker__stat--up' : 'ex-ticker__stat--down'}`}>
          <span className="ex-ticker__stat-label">24h Change</span>
          <span>
            {ticker
              ? `${
                  Number.isFinite(changeAbs)
                    ? `${changeAbs >= 0 ? '+' : ''}${fmtNum(changeAbs, 2)} `
                    : ''
                }(${changePct >= 0 ? '+' : ''}${fmtNum(changePct, 2)}%)`
              : '—'}
          </span>
        </div>

        <div className="ex-ticker__stat-block">
          <span className="ex-ticker__stat-label">24h High</span>
          <span>{ticker ? fmtNum(high24h, 2) : '—'}</span>
        </div>

        <div className="ex-ticker__stat-block">
          <span className="ex-ticker__stat-label">24h Low</span>
          <span>{ticker ? fmtNum(low24h, 2) : '—'}</span>
        </div>

        <div className="ex-ticker__stat-block">
          <span className="ex-ticker__stat-label">24h Volume({quoteAsset})</span>
          <span>{ticker ? fmtLocale(quoteVol, { maximumFractionDigits: 2 }) : '—'}</span>
        </div>

        <div className="ex-ticker__stat-block ex-ticker__stat-block--clock">
          <span className="ex-ticker__stat-label">Time</span>
          <span className="ex-ticker__clock">{liveClock}</span>
        </div>
        </div>
      </div>

      <nav className="ex-mobile-nav" aria-label="Trade sections">
        {[
          { id: 'chart', label: 'Chart' },
          { id: 'trade', label: 'Trade' },
          { id: 'markets', label: 'Markets' },
          { id: 'book', label: 'Depth' },
          { id: 'orders', label: 'History' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={mobileView === item.id ? 'is-active' : ''}
            onClick={() => setMobileView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="ex-grid">
        <aside className={`ex-panel ex-markets ex-zone ex-zone--markets${mobileView === 'markets' ? ' is-active' : ''}`}>
          {/* <div className="ex-markets__tabs">
            <button type="button" className={marketTab === 'USDT' ? 'is-active' : ''} onClick={() => setMarketTab('USDT')}>
              USDT
            </button>
            <button type="button" className={marketTab === 'INR' ? 'is-active' : ''} onClick={() => setMarketTab('INR')}>
              INR
            </button>
            <button type="button" className={marketTab === 'BNB' ? 'is-active' : ''} onClick={() => setMarketTab('BNB')} disabled>
              BNB
            </button>
          </div> */}
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
              const rowQuote = pairQuote(p, tradingPairs);
              const rowLabel = pairMeta(p, tradingPairs)?.displayPair || `${pairBase(p, tradingPairs)}/${rowQuote}`;
              return (
                <div
                  key={p}
                  className={`ex-markets__row ${active ? 'is-active' : ''}`}
                  onClick={() => selectSymbol(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectSymbol(p)}
                >
                  <span className="ex-markets__pair">
                    <CoinIcon
                      symbol={pairBase(p, tradingPairs)}
                      imageUrl={pairMeta(p, tradingPairs)?.imageUrl}
                      coingeckoId={pairMeta(p, tradingPairs)?.coingeckoId}
                      type={rowQuote === 'INR' ? 'commodity' : 'crypto'}
                      name={pairMeta(p, tradingPairs)?.name}
                      size={20}
                    />
                    {rowLabel}
                  </span>
                  <span>
                    {w?.lastPrice != null
                      ? formatTradePrice(w.lastPrice, rowQuote)
                      : '—'}
                  </span>
                  <span className={pct >= 0 ? 'ex-change--up' : 'ex-change--down'}>
                    {w ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ex-markets__balance ex-wallet-card">
            <h4 className="ex-wallet-card__title">Wallet</h4>
            {user ? (
              balances != null ? (
                <dl className="ex-wallet-card__kv">
                  <dt>Tradeable</dt>
                  <dd>{usdtBalance.toFixed(2)}</dd>
                  <dt>Main</dt>
                  <dd>{walletMain.toFixed(2)}</dd>
                  <dt>Referral</dt>
                  <dd>{walletReferral.toFixed(2)}</dd>
                  <dt>Bonus</dt>
                  <dd>{walletBonus.toFixed(2)}</dd>
                  <dt>Withdrawable</dt>
                  <dd>{walletWithdrawable.toFixed(2)}</dd>
                  <dt>Locked</dt>
                  <dd>{walletLocked.toFixed(2)}</dd>
                </dl>
              ) : (
                <p className="ex-wallet-card__loading">Loading wallet…</p>
              )
            ) : (
              <Link to="/login" state={loginReturn} className="ex-markets__login-link">
                Log in to view balance
              </Link>
            )}
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
                  <span>{formatTradePrice(t.price, quoteAsset)}</span>
                  <span>{t.qty.toFixed(5)}</span>
                  <span>{pairLabel}</span>
                  <span>{formatMarketTime(t.time)}</span>
                </div>
              ))}
              {!tape.length && (
                <div className="ex-tape__empty">Waiting for trades…</div>
              )}
            </div>
          </div>
        </aside>

        <section className="ex-center">
          <div className={`ex-panel ex-chart-area ex-zone ex-zone--chart${mobileView === 'chart' ? ' is-active' : ''}`}>
            <div className="ex-chart-toolbar">
              <div className="ex-chart-toolbar__left">
                <span className="ex-chart-toolbar__symbol">{pairLabel}</span>
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
              <div className="ex-chart-toolbar__tools ex-chart-toolbar__tools--desktop">
                <span>Indicators</span>
                <span>Templates</span>
              </div>
            </div>
            <Suspense fallback={<div className="ex-chart-wrap ex-chart-wrap--loading" aria-busy="true" />}>
              <LiveChart
                key={`${String(symbol).toUpperCase()}-${chartInterval}-${chartEpoch}`}
                variant="exchange"
                className="ex-chart-wrap"
                candles={candles}
              />
            </Suspense>
          </div>

          <div className={`ex-orders ex-zone ex-zone--trade${mobileView === 'trade' ? ' is-active' : ''}`}>
            <div className="ex-mobile-order-tabs">
              <button type="button" className={mobileOrderSide === 'buy' ? 'is-active' : ''} onClick={() => setMobileOrderSide('buy')}>
                Buy
              </button>
              <button type="button" className={mobileOrderSide === 'sell' ? 'is-active' : ''} onClick={() => setMobileOrderSide('sell')}>
                Sell
              </button>
            </div>

            <div className={`ex-panel ex-order-card ex-order-card--buy${mobileOrderSide === 'sell' ? ' ex-order-card--hidden-mobile' : ''}`}>
              <div className="ex-order-card__head">
                <h3>Buy {base}</h3>
                <p className="ex-balance-line">
                  {user ? (
                    <button
                      type="button"
                      className="ex-balance-line__btn"
                      title="Use max USDT"
                      onClick={fillBuyMax}
                    >
                      USDT: {usdtBalance.toFixed(2)}
                      <span className="ex-balance-line__inr"> ({fmtINR(toInr(usdtBalance))})</span>
                      <span className="ex-balance-line__hint"> · click to fill</span>
                    </button>
                  ) : (
                    <Link to="/login" state={loginReturn} className="ex-balance-line__link">Log in for balance</Link>
                  )}
                </p>
              </div>
              <div className="ex-tabs-inline">
                <button type="button" className={buyType === 'limit' ? 'is-active' : ''} onClick={() => setBuyType('limit')}>
                  Limit
                </button>
                <button
                  type="button"
                  className={buyType === 'market' ? 'is-active' : ''}
                  onClick={() => {
                    setBuyType('market');
                    if (ticker?.lastPrice != null && ticker.lastPrice !== '') {
                      setBuyPrice(String(ticker.lastPrice));
                    }
                  }}
                >
                  Market
                </button>
              </div>
              <div className="field">
                <label>Price ({quoteAsset}{isInrPair ? '/g' : ''})</label>
                <input
                  className="ex-input"
                  disabled={buyType === 'market'}
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Amount ({isInrPair ? `${base} (${unitLabel})` : base})</label>
                <input className="ex-input" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
              </div>
              <div className="field">
                <label>Total ({quoteAsset})</label>
                <input className="ex-input" readOnly value={buyTotal} placeholder="0.00" />
                {isInrPair && buyTotalUsdtHint ? (
                  <small className="ex-balance-line__inr">≈ {buyTotalUsdtHint} USDT from wallet</small>
                ) : null}
              </div>
              <button
                type="button"
                className="ex-btn-buy"
                disabled={orderBusySide === 'buy'}
                onClick={() => place('buy', buyType)}
              >
                {orderBusySide === 'buy' ? 'Placing…' : user ? `Buy ${base}` : 'Log in to Buy'}
              </button>
            </div>

            <div className={`ex-panel ex-order-card ex-order-card--sell${mobileOrderSide === 'buy' ? ' ex-order-card--hidden-mobile' : ''}`}>
              <div className="ex-order-card__head">
                <h3>Sell {base}</h3>
                <p className="ex-balance-line">
                  {user ? (
                    <button
                      type="button"
                      className="ex-balance-line__btn"
                      title={`Sell all ${base}`}
                      onClick={fillSellMax}
                    >
                      {base}: {baseBalance.toFixed(8).replace(/\.?0+$/, '') || '0'}
                      <span className="ex-balance-line__hint"> · click to fill</span>
                    </button>
                  ) : (
                    <Link to="/login" state={loginReturn} className="ex-balance-line__link">Log in for balance</Link>
                  )}
                </p>
              </div>
              <div className="ex-tabs-inline">
                <button type="button" className={sellType === 'limit' ? 'is-active' : ''} onClick={() => setSellType('limit')}>
                  Limit
                </button>
                <button
                  type="button"
                  className={sellType === 'market' ? 'is-active' : ''}
                  onClick={() => {
                    setSellType('market');
                    if (ticker?.lastPrice != null && ticker.lastPrice !== '') {
                      setSellPrice(String(ticker.lastPrice));
                    }
                  }}
                >
                  Market
                </button>
              </div>
              <div className="field">
                <label>Price ({quoteAsset}{isInrPair ? '/g' : ''})</label>
                <input
                  className="ex-input"
                  disabled={sellType === 'market'}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Amount ({isInrPair ? `${base} (${unitLabel})` : base})</label>
                <input className="ex-input" value={sellQty} onChange={(e) => setSellQty(e.target.value)} />
              </div>
              <div className="field">
                <label>Total ({quoteAsset})</label>
                <input className="ex-input" readOnly value={sellTotal} placeholder="0.00" />
                {isInrPair && sellTotalUsdtHint ? (
                  <small className="ex-balance-line__inr">≈ {sellTotalUsdtHint} USDT to wallet</small>
                ) : null}
              </div>
              <button
                type="button"
                className="ex-btn-sell"
                disabled={orderBusySide === 'sell'}
                onClick={() => place('sell', sellType)}
              >
                {orderBusySide === 'sell' ? 'Placing…' : user ? `Sell ${base}` : 'Log in to Sell'}
              </button>
            </div>
          </div>
        </section>

        <aside className={`ex-side-stack ex-zone ex-zone--book${mobileView === 'book' ? ' is-active' : ''}`}>
          <div className="ex-panel ex-panel--depth">
            <div className="ex-panel__head">Market Depth</div>
            <div className="ex-book">
              <div className="ex-book__header">
                <span>Price</span>
                <span>Qty</span>
                <span>Total ({quoteAsset})</span>
              </div>
              <div className="ex-book__side ex-book__side--asks">
                {[...(depth.asks || [])].reverse().slice(0, 12).map((r, i) => (
                  <button
                    type="button"
                    key={`a-${i}`}
                    className="ex-book__row ex-book__row--ask"
                    onClick={() => fillFromBook(r, 'ask')}
                    title="Fill buy form"
                  >
                    <span>{r.price.toFixed(4)}</span>
                    <span>{r.qty.toFixed(4)}</span>
                    <span>{(r.price * r.qty).toFixed(2)}</span>
                  </button>
                ))}
              </div>
              <div className={`ex-book__mid ${priceUp ? 'ex-book__mid--up' : 'ex-book__mid--down'}`}>
                {depth.mid != null
                  ? depth.mid.toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : ticker?.lastPrice?.toLocaleString() ?? '—'}
              </div>
              <div className="ex-book__side ex-book__side--bids">
                {(depth.bids || []).slice(0, 12).map((r, i) => (
                  <button
                    type="button"
                    key={`b-${i}`}
                    className="ex-book__row ex-book__row--bid"
                    onClick={() => fillFromBook(r, 'bid')}
                    title="Fill sell form"
                  >
                    <span>{r.price.toFixed(4)}</span>
                    <span>{r.qty.toFixed(4)}</span>
                    <span>{(r.price * r.qty).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

         
        </aside>
      </div>

      <section
        id="ex-history"
        className={`ex-panel ex-history ex-my-orders ex-zone ex-zone--orders${mobileView === 'orders' ? ' is-active' : ''}`}
      >
        <div className="ex-history__title">My Orders</div>
        {!user ? (
          <div className="ex-my-orders__guest">
            <p>Log in to view your orders and trade history.</p>
            <Link to="/login" state={loginReturn} className="btn-outline-accent no-underline">
              Log in
            </Link>
          </div>
        ) : (
          <>
            <div className="ex-my-orders__subtabs">
              <button
                type="button"
                className={orderStatusTab === 'pending' ? 'is-active' : ''}
                onClick={() => setOrderStatusTab('pending')}
              >
                Pending
              </button>
              <button
                type="button"
                className={orderStatusTab === 'completed' ? 'is-active' : ''}
                onClick={() => setOrderStatusTab('completed')}
              >
                Completed
              </button>
              <button
                type="button"
                className={orderStatusTab === 'history' ? 'is-active' : ''}
                onClick={() => setOrderStatusTab('history')}
              >
                Trade History
              </button>
            </div>
            <div className="ex-my-orders__toolbar">
              <input
                type="search"
                className="ex-input ex-my-orders__search"
                placeholder="Search pair…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
              <select
                className="ex-input ex-my-orders__pagesize"
                value={tablePageSize}
                onChange={(e) => setTablePageSize(Number(e.target.value))}
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
            <div className="ex-my-orders__split">
              {renderOrderSideCard('buy', buyTable, (page) => setBuyTable((t) => ({ ...t, page })))}
              {renderOrderSideCard('sell', sellTable, (page) => setSellTable((t) => ({ ...t, page })))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
