import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, parseApiResponse } from '../api/client.js';
import LiveChart from '../components/LiveChart.jsx';
import { acquireMarketSocket, releaseMarketSocket } from '../services/appSocket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fmtINR } from '../utils/format.js';
import { useTradingPairs } from '../context/TradingPairsContext.jsx';
import { DEPTH_POLL_MS, TRADE_MARKET_POLL_MS, CLOCK_TICK_MS } from '../config/marketPoll.js';
import { formatLiveClock, formatMarketTime } from '../utils/timeFormat.js';
import { notifyWalletUpdated } from '../utils/walletEvents.js';
import './Trading.css';

const CHART_INTERVALS = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
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
  const { user } = useAuth();
  const { toInr, usdtInrRate } = usePlatformConfig();
  const { pairs: tradingPairs, symbols: watchlistSymbols } = useTradingPairs();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loginReturn = { from: { pathname: '/trade' } };
  const [symbol, setSymbol] = useState('BNBUSDT');
  const [marketTab, setMarketTab] = useState('USDT');
  const [search, setSearch] = useState('');
  const [chartInterval, setChartInterval] = useState('4h');
  const [candles, setCandles] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(10);
  const [tableTotalPages, setTableTotalPages] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const [tableLoading, setTableLoading] = useState(false);
  const [ticker, setTicker] = useState(null);
  const [priceDir, setPriceDir] = useState('up');
  const prevPriceRef = useRef(null);
  const [balances, setBalances] = useState(null);
  const [depth, setDepth] = useState({ bids: [], asks: [], mid: null });
  const [tape, setTape] = useState([]);

  const [buyType, setBuyType] = useState('market');
  const [sellType, setSellType] = useState('market');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyQty, setBuyQty] = useState('0.01');
  const [sellQty, setSellQty] = useState('0.01');

  const [orderSideTab, setOrderSideTab] = useState('buy');
  const [orderStatusTab, setOrderStatusTab] = useState('pending');
  const [orderBusy, setOrderBusy] = useState(false);
  const [mobileView, setMobileView] = useState('chart');
  const [mobileOrderSide, setMobileOrderSide] = useState('buy');

  const [watchPrices, setWatchPrices] = useState({});
  const [liveClock, setLiveClock] = useState(() => formatLiveClock());

  const debouncedTableSearch = useDebounced(tableSearch);

  const usdtBalance = Number(
    balances?.available_balance ??
      Math.max(0, Number(balances?.balance_usdt ?? balances?.balance ?? 0) - Number(balances?.locked_balance ?? 0))
  );

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
    return watchlistSymbols.filter((p) => p.endsWith(suffix) && (!q || p.includes(q)));
  }, [search, watchlistSymbols, marketTab]);

  const tableFromRow = tableTotal === 0 ? 0 : (tablePage - 1) * tablePageSize + 1;
  const tableToRow = Math.min(tablePage * tablePageSize, tableTotal);

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
    const param = searchParams.get('symbol')?.toUpperCase();
    if (param && watchlistSymbols.includes(param)) {
      setSymbol(param);
      setMarketTab(param.endsWith('INR') ? 'INR' : 'USDT');
    }
  }, [searchParams, watchlistSymbols]);

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
    const id = setInterval(() => loadLivePrices().catch(() => {}), TRADE_MARKET_POLL_MS);
    return () => clearInterval(id);
  }, [loadLivePrices]);

  useEffect(() => {
    setLiveClock(formatLiveClock());
    const id = setInterval(() => setLiveClock(formatLiveClock()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setChartInterval('4h');
  }, [symbol]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await api.get('/market/klines', {
        params: { symbol, interval: chartInterval, limit: 500 },
      });
      if (!active) return;
      const klines = parseApiResponse(data);
      setCandles(klines?.candles || []);
    })();
    return () => {
      active = false;
    };
  }, [symbol, chartInterval]);

  const refreshBalance = useCallback(async () => {
    const { data } = await api.get('/wallet/balance');
    const wallet = parseApiResponse(data);
    setBalances(wallet);
    notifyWalletUpdated(wallet);
    return wallet;
  }, []);

  const socketRef = useRef(null);

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

    const onMerged = (payload) => {
      if (!payload?.candle || payload.symbol !== sym || payload.interval !== chartInterval) return;
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
      if (user) refreshBalance().catch(() => {});
    };

    socket.on('market:klines:merged', onMerged);
    socket.on('market:manual:updated', onManual);
    socket.on('market:depth', onDepth);
    socket.on('market:trade', onTrade);

    socket.emit('market:subscribe', { symbol: sym, interval: chartInterval });
    if (chartInterval !== '1s') {
      socket.emit('market:subscribe', { symbol: sym, interval: '1s' });
    }

    return () => {
      socket.emit('market:unsubscribe', { symbol: sym, interval: chartInterval });
      if (chartInterval !== '1s') {
        socket.emit('market:unsubscribe', { symbol: sym, interval: '1s' });
      }
      socket.off('market:klines:merged', onMerged);
      socket.off('market:manual:updated', onManual);
      socket.off('market:depth', onDepth);
      socket.off('market:trade', onTrade);
    };
  }, [symbol, chartInterval, refreshBalance, user]);

  // REST fallback for order book — works on live even when WebSocket depth events fail.
  useEffect(() => {
    const sym = symbol.toUpperCase();
    let active = true;

    async function loadDepth() {
      try {
        const { data } = await api.get('/market/depth', { params: { symbol: sym, limit: 20 } });
        if (!active) return;
        const payload = parseApiResponse(data);
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
      } catch {
        /* keep socket data if REST fails */
      }
    }

    loadDepth();
    const id = setInterval(loadDepth, DEPTH_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [symbol]);

  const fetchTableData = useCallback(async () => {
    if (!user) {
      setTableRows([]);
      setTableTotal(0);
      setTableTotalPages(1);
      setTableLoading(false);
      return;
    }
    setTableLoading(true);
    try {
      const params = {
        page: tablePage,
        pageSize: tablePageSize,
        sortBy: 'createdAt',
        sortDir: 'desc',
        side: orderSideTab,
      };
      if (debouncedTableSearch) params.search = debouncedTableSearch;

      if (orderStatusTab === 'history') {
        const { data } = await api.get('/orders/trades', { params });
        const payload = parseApiResponse(data);
        setTableRows(payload?.rows || []);
        setTableTotal(payload?.total || 0);
        setTableTotalPages(payload?.totalPages || 1);
      } else {
        const { data } = await api.get('/orders', {
          params: { ...params, status: orderStatusTab },
        });
        const payload = parseApiResponse(data);
        setTableRows(payload?.rows || []);
        setTableTotal(payload?.total || 0);
        setTableTotalPages(payload?.totalPages || 1);
      }
    } catch {
      setTableRows([]);
      setTableTotal(0);
      setTableTotalPages(1);
    } finally {
      setTableLoading(false);
    }
  }, [tablePage, tablePageSize, debouncedTableSearch, orderSideTab, orderStatusTab, user]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  useEffect(() => {
    setTablePage(1);
  }, [debouncedTableSearch, orderSideTab, orderStatusTab, tablePageSize]);

  useEffect(() => {
    if (!user) {
      setBalances(null);
      return undefined;
    }
    refreshBalance().catch(() => {});
    const onWallet = (e) => {
      if (e.detail) setBalances(e.detail);
    };
    window.addEventListener('wallet:updated', onWallet);
    return () => window.removeEventListener('wallet:updated', onWallet);
  }, [refreshBalance, user]);

  function requireLogin() {
    navigate('/login', { state: loginReturn });
  }

  async function place(side, orderType) {
    if (!user) {
      requireLogin();
      return;
    }
    if (orderBusy) return;
    const qty = parseFloat(side === 'buy' ? buyQty : sellQty);
    const priceRaw = side === 'buy' ? buyPrice : sellPrice;
    if (!(qty > 0)) {
      toast.warning('Enter a valid quantity greater than zero.');
      return;
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
    setOrderBusy(true);
    try {
      const { data } = await api.post('/orders', payload);
      const result = parseApiResponse(data);
      if (result?.wallet) {
        setBalances(result.wallet);
        notifyWalletUpdated(result.wallet);
      } else {
        await refreshBalance();
      }
      await fetchTableData();
      window.dispatchEvent(new CustomEvent('orders:updated'));
    } catch {
      /* API error toast handled globally */
    } finally {
      setOrderBusy(false);
    }
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
  const hasLiveChange = Number.isFinite(openNum) && openNum > 0 && Number.isFinite(lastNum);
  const changePct = hasLiveChange
    ? ((lastNum - openNum) / openNum) * 100
    : Number(ticker?.priceChangePercent ?? 0);
  const changeAbs = hasLiveChange
    ? lastNum - openNum
    : Number(ticker?.priceChange ?? NaN);
  const changeUp = changePct >= 0;
  const priceUp = priceDir !== 'down';
  const high24h = Number.isFinite(lastNum)
    ? Math.max(Number(ticker?.highPrice) || lastNum, lastNum)
    : Number(ticker?.highPrice);
  const low24h = Number.isFinite(lastNum)
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

  return (
    <div className={`trading-page${mobileView === 'orders' ? ' trading-page--orders-view' : ''}`}>
      {!user && (
        <div className="ex-guest-banner">
          <span>You are viewing live markets as a guest.</span>
          <Link to="/login" state={loginReturn}>Log in</Link>
          <span>or</span>
          <Link to="/signup">Sign up</Link>
          <span>to place orders.</span>
        </div>
      )}
      <div className="ex-ticker ex-ticker--scroll">
        <div className="ex-ticker__pair-wrap">
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
          <div className="ex-markets__tabs">
            <button type="button" className={marketTab === 'USDT' ? 'is-active' : ''} onClick={() => setMarketTab('USDT')}>
              USDT
            </button>
            <button type="button" className={marketTab === 'INR' ? 'is-active' : ''} onClick={() => setMarketTab('INR')}>
              INR
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
                  <span className="ex-markets__pair">{rowLabel}</span>
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
          <div className="ex-markets__balance">
            <small>SPOT balance</small>
            <div>
              {user ? (
                <>
                  <strong>{balances != null ? usdtBalance.toFixed(2) : '—'}</strong> USDT available
                  {balances != null && (
                    <span className="ex-balance-line__inr"> ({fmtINR(toInr(usdtBalance))})</span>
                  )}
                </>
              ) : (
                <Link to="/login" state={loginReturn} className="ex-markets__login-link">
                  Log in to view balance
                </Link>
              )}
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
            <LiveChart variant="exchange" className="ex-chart-wrap" candles={candles} />
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
                    <>
                      USDT: {usdtBalance.toFixed(2)}
                      <span className="ex-balance-line__inr"> ({fmtINR(toInr(usdtBalance))})</span>
                    </>
                  ) : (
                    <Link to="/login" state={loginReturn} className="ex-balance-line__link">Log in for balance</Link>
                  )}
                </p>
              </div>
              <div className="ex-tabs-inline">
                <button type="button" className={buyType === 'limit' ? 'is-active' : ''} onClick={() => setBuyType('limit')}>
                  Limit
                </button>
                <button type="button" className={buyType === 'market' ? 'is-active' : ''} onClick={() => setBuyType('market')}>
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
              <button type="button" className="ex-btn-buy" disabled={orderBusy} onClick={() => place('buy', buyType)}>
                {orderBusy ? 'Placing…' : user ? `Buy ${base}` : 'Log in to Buy'}
              </button>
            </div>

            <div className={`ex-panel ex-order-card ex-order-card--sell${mobileOrderSide === 'buy' ? ' ex-order-card--hidden-mobile' : ''}`}>
              <div className="ex-order-card__head">
                <h3>Sell {base}</h3>
                <p className="ex-balance-line">
                  {user ? (
                    <>{base}: {baseBalance.toFixed(8).replace(/\.?0+$/, '') || '0'}</>
                  ) : (
                    <Link to="/login" state={loginReturn} className="ex-balance-line__link">Log in for balance</Link>
                  )}
                </p>
              </div>
              <div className="ex-tabs-inline">
                <button type="button" className={sellType === 'limit' ? 'is-active' : ''} onClick={() => setSellType('limit')}>
                  Limit
                </button>
                <button type="button" className={sellType === 'market' ? 'is-active' : ''} onClick={() => setSellType('market')}>
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
              <button type="button" className="ex-btn-sell" disabled={orderBusy} onClick={() => place('sell', sellType)}>
                {orderBusy ? 'Placing…' : user ? `Sell ${base}` : 'Log in to Sell'}
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
                  <div key={`a-${i}`} className="ex-book__row ex-book__row--ask">
                    <span>{r.price.toFixed(4)}</span>
                    <span>{r.qty.toFixed(4)}</span>
                    <span>{(r.price * r.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className={`ex-book__mid ${priceUp ? 'ex-book__mid--up' : 'ex-book__mid--down'}`}>
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

         
        </aside>
      </div>

      <section
        id="ex-history"
        className={`ex-panel ex-history ex-my-orders ex-zone ex-zone--orders${mobileView === 'orders' ? ' is-active' : ''}`}
      >
        <div className="ex-history__title">My Orders</div>
        {user && (
          <>
        <div className="ex-my-orders__tabs">
          <button type="button" className={orderSideTab === 'buy' ? 'is-active' : ''} onClick={() => setOrderSideTab('buy')}>
            Buy
          </button>
          <button type="button" className={orderSideTab === 'sell' ? 'is-active' : ''} onClick={() => setOrderSideTab('sell')}>
            Sell
          </button>
        </div>
        <div className="ex-my-orders__subtabs">
          <button type="button" className={orderStatusTab === 'pending' ? 'is-active' : ''} onClick={() => setOrderStatusTab('pending')}>
            Pending
          </button>
          <button type="button" className={orderStatusTab === 'completed' ? 'is-active' : ''} onClick={() => setOrderStatusTab('completed')}>
            Completed
          </button>
          <button type="button" className={orderStatusTab === 'history' ? 'is-active' : ''} onClick={() => setOrderStatusTab('history')}>
            Trade History
          </button>
        </div>
        <div className="ex-my-orders__toolbar">
          <input
            type="search"
            className="ex-input ex-my-orders__search"
            placeholder={orderStatusTab === 'history' ? 'Search pair, side…' : 'Search pair, status…'}
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
          />
          <select
            className="ex-input ex-my-orders__pagesize"
            value={tablePageSize}
            onChange={(e) => setTablePageSize(Number(e.target.value))}
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>
          </>
        )}
        <div className="ex-my-orders__scroll">
          {!user ? (
            <div className="ex-my-orders__guest">
              <p>Log in to view your orders and trade history.</p>
              <Link to="/login" state={loginReturn} className="btn-outline-accent no-underline">
                Log in
              </Link>
            </div>
          ) : tableLoading ? (
            <div className="ex-my-orders__loading">Loading…</div>
          ) : orderStatusTab === 'history' ? (
            <div className="ex-my-orders__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Pair</th>
                  <th>Price</th>
                  <th>Amount</th>
                  <th>Total</th>
                  <th>Fee</th>
                  <th>Date &amp; Time</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((t) => (
                  <tr key={t.id || t._id}>
                    <td>
                      <span className={`ex-status-badge ex-status-badge--${t.side}`}>{t.side}</span>
                    </td>
                    <td>{orderPairLabel(t.symbol, tradingPairs)}</td>
                    <td>{formatTradePrice(t.price, pairQuote(t.symbol, tradingPairs))}</td>
                    <td>{t.quantity}</td>
                    <td>{t.total ?? fmtNum(Number(t.price) * Number(t.quantity), 2)}</td>
                    <td>{t.fee != null ? fmtNum(t.fee, 4) : '—'}</td>
                    <td>{t.createdAt ? formatMarketTime(t.createdAt) : '—'}</td>
                  </tr>
                ))}
                {!tableRows.length && (
                  <tr>
                    <td colSpan={7} className="ex-empty-row">
                      No {orderSideTab} trade history yet.
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((o) => {
                return (
                  <tr key={o._id || o.id}>
                    <td>{orderPairLabel(o.symbol, tradingPairs)}</td>
                    <td>{orderDisplayPrice(o)}</td>
                    <td>{o.quantity}</td>
                    <td>{orderDisplayTotal(o)}</td>
                    <td>{o.createdAt ? formatMarketTime(o.createdAt) : '—'}</td>
                    <td>
                      <span className="ex-status-badge">{o.status}</span>
                    </td>
                  </tr>
                );
              })}
              {!tableRows.length && (
                <tr>
                  <td colSpan={6} className="ex-empty-row">
                    No {orderStatusTab} {orderSideTab} orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          )}
        </div>
        {!user ? null : !tableLoading && tableTotal > 0 && (
          <div className="ex-my-orders__pagination">
            <span>
              Showing {tableFromRow}–{tableToRow} of {tableTotal}
            </span>
            <div className="ex-my-orders__pagination-actions">
              <button
                type="button"
                disabled={tablePage <= 1}
                onClick={() => setTablePage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {tablePage} of {tableTotalPages}</span>
              <button
                type="button"
                disabled={tablePage >= tableTotalPages}
                onClick={() => setTablePage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
