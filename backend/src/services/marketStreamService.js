import { persistCompletedCandle, persistMarketKlines } from './marketDataService.js';
import { processOrdersForPrice, notifySpotOrderFills } from './orderEngine.js';
import { resolveEffectivePrice } from './priceEngine.js';
import { updateLiveCandle, clearLiveCandles, getLiveCandle, seedLiveCandle } from './candleEngine.js';
import { getLivePrice, getLiveCandle as getRedisCandle } from './liveStateStore.js';
import { isRedisReady } from '../config/redis.js';
import { isMarketLeader } from './marketLeader.js';
import {
  publishMarketTick,
  publishMarketCandle,
  publishMarketTrade,
  setMarketTickHandler,
} from './marketRedisBridge.js';
import {
  fetchKlines,
  fetchTicker,
  fetchDepth,
  fetchAggTrades,
  intervalToMs,
  recordPriceTick,
  clearRecentTicks,
  syntheticOrderBook,
} from './marketDataProvider.js';
import { getPulseDepthOverlay } from './pricePulseService.js';
import { getPairSync } from './tradingPairService.js';
import { getCachedDexPrice } from './dexscreenerService.js';
import { getWsLivePrice, onBinanceWsTrade } from './binanceWsService.js';

const TICK_POLL_MS = Number(process.env.MARKET_STREAM_POLL_MS) || 1000;
const DEX_TICK_POLL_MS = Number(process.env.MARKET_DEX_STREAM_POLL_MS) || 8000;
const KLINE_POLL_MS = Number(process.env.MARKET_KLINE_POLL_MS) || 30_000;
const LIVE_BAR_POLL_MS = Number(process.env.MARKET_LIVE_BAR_MS) || 3000;
const DEX_LIVE_BAR_POLL_MS = Number(process.env.MARKET_DEX_LIVE_BAR_MS) || 8000;
const DEPTH_POLL_MS = Number(process.env.MARKET_DEPTH_POLL_MS) || 5000;
/** How often to fetch agg trades relative to depth polls (1 = every depth tick). */
const AGG_TRADE_EVERY_N = Math.max(1, Number(process.env.MARKET_AGG_TRADE_EVERY_N) || 3);
const IDLE_PRUNE_MS = Number(process.env.MARKET_STREAM_IDLE_PRUNE_MS) || 15_000;
/** Persist/order-match throttle — avoid order scan every tick (no Mongo on live path). */
const ORDER_MATCH_THROTTLE_MS = Number(process.env.MARKET_ORDER_MATCH_MS) || 1500;

const activeStreams = new Map();
/** @type {Map<string, number>} */
const streamRefs = new Map();
const aggState = new Map();
/** Last depth emitted per symbol — used for instant snapshot on subscribe */
const lastDepthBySymbol = new Map();
const lastCandleByKey = new Map();
/** Throttle identical error logs per symbol */
const lastStreamErrAt = new Map();
/** @type {ReturnType<typeof setInterval>|null} */
let idlePruneTimer = null;
/** Shared io for idle prune room checks */
let ioRef = null;

function roomHasSubscribers(io, room) {
  if (!io?.sockets?.adapter?.rooms) return true;
  const size = io.sockets.adapter.rooms.get(room)?.size || 0;
  return size > 0;
}

function symbolHasAnySubscribers(io, symbol) {
  const sym = String(symbol).toUpperCase();
  if (roomHasSubscribers(io, depthRoom(sym))) return true;
  for (const key of activeStreams.keys()) {
    if (!key.startsWith(`${sym}|`)) continue;
    const interval = key.slice(sym.length + 1);
    if (roomHasSubscribers(io, roomName(sym, interval))) return true;
  }
  return false;
}

function stopMarketStream(key) {
  const stop = activeStreams.get(key);
  if (!stop) return;
  try {
    stop();
  } catch {
    /* ignore */
  }
  activeStreams.delete(key);
  streamRefs.delete(key);
}

function pruneIdleStreams(io) {
  if (!io) return;
  for (const key of [...activeStreams.keys()]) {
    const [sym, interval] = key.split('|');
    if (!sym || !interval) continue;
    const candleRoom = roomName(sym, interval);
    if (roomHasSubscribers(io, candleRoom)) continue;
    // Keep 1s only while any depth/candle room for the symbol is active
    if (interval === '1s' && symbolHasAnySubscribers(io, sym)) continue;
    stopMarketStream(key);
  }
}

function ensureIdlePrune(io) {
  ioRef = io;
  if (idlePruneTimer) return;
  idlePruneTimer = setInterval(() => pruneIdleStreams(ioRef), IDLE_PRUNE_MS);
  idlePruneTimer.unref?.();
}

function isExternalDexPair(symbol) {
  const pair = getPairSync(symbol);
  const src = pair?.priceSource;
  return src === 'dexscreener' || src === 'coingecko' || src === 'commodity_inr';
}

function logStreamErr(tag, symbol, err) {
  const key = `${tag}|${symbol}|${err?.message || ''}`;
  const now = Date.now();
  if (now - (lastStreamErrAt.get(key) || 0) < 60_000) return;
  lastStreamErrAt.set(key, now);
  console.warn(`[marketStream] ${tag} ${symbol}: ${err?.message || err}`);
}

async function safeFetchTicker(sym) {
  try {
    return await fetchTicker(sym);
  } catch (err) {
    const cached = getCachedDexPrice(sym);
    if (cached?.price > 0) {
      return {
        symbol: sym,
        price: cached.price,
        lastPrice: cached.price,
        change_24h: cached.change_24h,
        volume: cached.volume,
        quoteVolume: cached.quoteVolume,
        provider: 'dexscreener',
        stale: true,
      };
    }
    throw err;
  }
}

export function roomName(symbol, interval) {
  return `m:${String(symbol).toUpperCase()}:${interval}`;
}

/** Shared depth/trades room for a symbol (all chart intervals receive the same book). */
export function depthRoom(symbol) {
  return `d:${String(symbol).toUpperCase()}`;
}

function throttleByKey(fn, ms) {
  const last = new Map();
  return (key, ...args) => {
    const now = Date.now();
    if (now - (last.get(key) || 0) < ms) return;
    last.set(key, now);
    return fn(...args);
  };
}

function emitDepth(io, symbol, depth) {
  if (!depth || (!depth.bids?.length && !depth.asks?.length)) return;
  const sym = String(symbol).toUpperCase();
  const payload = { symbol: sym, ...depth };
  lastDepthBySymbol.set(sym, payload);
  io.to(depthRoom(sym)).emit('market:depth', payload);
  // Backward-compat: also emit to 1s candle room
  io.to(roomName(sym, '1s')).emit('market:depth', payload);
}

function emitCandle(io, symbol, interval, candle) {
  if (!candle) return;
  const sym = String(symbol).toUpperCase();
  const payload = { symbol: sym, interval, candle };
  lastCandleByKey.set(`${sym}|${interval}`, payload);
  io.to(roomName(sym, interval)).emit('market:klines:merged', payload);
}

/** Drop cached pulse OHLC so reconnect/subscribe does not re-paint the spike. */
export function clearLastCandleCache(symbol, interval) {
  const sym = String(symbol || '').toUpperCase();
  if (interval) {
    lastCandleByKey.delete(`${sym}|${interval}`);
    return;
  }
  for (const key of [...lastCandleByKey.keys()]) {
    if (key.startsWith(`${sym}|`)) lastCandleByKey.delete(key);
  }
}

/** Reset in-memory tick buckets after a pulse so live candles resume cleanly. */
export function resetPulseStreamState(symbol) {
  const sym = String(symbol || '').toUpperCase();
  clearRecentTicks(sym);
  aggState.delete(sym);
  clearLiveCandles(sym);
  clearLastCandleCache(sym);
}

export { emitCandle };

function getActiveIntervalsForSymbol(sym) {
  const intervals = [];
  for (const streamKey of activeStreams.keys()) {
    if (!streamKey.startsWith(`${sym}|`)) continue;
    intervals.push(streamKey.slice(sym.length + 1));
  }
  return intervals;
}

function persistCompletedAsync(symbol, interval, candle, source = 'binance') {
  persistCompletedCandle(symbol, interval, candle, source).catch((err) => {
    logStreamErr('persist', symbol, err);
  });
}

const orderMatchThrottled = throttleByKey(
  async (sym, price, high, low, io) => {
    const trades = await processOrdersForPrice(sym, price, {
      priceHigh: high ?? price,
      priceLow: low ?? price,
    });
    if (trades.length && io) {
      await notifySpotOrderFills(io, sym, trades);
    }
  },
  ORDER_MATCH_THROTTLE_MS
);

/**
 * Core live path: Price Engine → Candle Engine (RAM) → Socket.IO → Redis pub.
 * MongoDB touched only when a candle bucket closes.
 */
function processPriceTick(
  io,
  sym,
  rawPrice,
  {
    volume = 0,
    pulseFill = false,
    precomputedState = null,
    fromRedis = false,
    publishRedis = false,
    matchOrders = true,
  } = {}
) {
  const state = precomputedState || resolveEffectivePrice(sym, rawPrice);
  const price = state.effectivePrice;
  if (!(price > 0)) return;

  const intervals = getActiveIntervalsForSymbol(sym);
  if (!intervals.includes('1s')) intervals.push('1s');

  let lastCandle = null;
  for (const interval of intervals) {
    const { candle, completed } = updateLiveCandle(sym, interval, price, {
      volume,
      pulse: state.source === 'pulse',
    });
    if (candle) {
      emitCandle(io, sym, interval, candle);
      lastCandle = candle;
      if (publishRedis && isRedisReady()) {
        publishMarketCandle({ symbol: sym, interval, candle });
      }
    }
    if (completed) {
      persistCompletedAsync(sym, interval, completed, 'binance');
    }
  }

  if (matchOrders && isMarketLeader()) {
    orderMatchThrottled(sym, price, lastCandle?.high, lastCandle?.low, io);
  }

  if (pulseFill && state.source === 'pulse' && matchOrders) {
    processOrdersForPrice(sym, price, {
      fromPrice: state.fromPrice ?? rawPrice,
      rangeOnly: true,
    })
      .then((trades) => {
        if (trades.length) return notifySpotOrderFills(io, sym, trades, { reason: 'pulse_fill' });
        return null;
      })
      .catch((err) => logStreamErr('pulse-fill', sym, err));
  }

  const tradePayload = {
    symbol: sym,
    price,
    effectivePrice: price,
    binancePrice: state.binancePrice,
    qty: volume,
    time: Date.now(),
    tickerOnly: !(volume > 0),
    pulse: state.source === 'pulse',
  };

  io.to(depthRoom(sym)).emit('market:trade', tradePayload);
  io.to(roomName(sym, '1s')).emit('market:trade', tradePayload);

  if (publishRedis && isRedisReady() && !fromRedis) {
    publishMarketTick({ symbol: sym, rawPrice, state, volume, pulseFill });
    publishMarketTrade(tradePayload);
  }
}

function pushLiveTick(io, sym, rawPrice, opts = {}) {
  const publishRedis = isRedisReady() && isMarketLeader();
  processPriceTick(io, sym, rawPrice, { ...opts, publishRedis, matchOrders: isMarketLeader() });
}

/** Wire Redis pub/sub → local Socket.IO (all API instances). */
export function initMarketStreamRedis(io) {
  setMarketTickHandler((msg) => {
    if (!io || !msg) return;
    if (msg.type === 'candle' && msg.candle) {
      emitCandle(io, msg.symbol, msg.interval, msg.candle);
      return;
    }
    if (msg.symbol != null && msg.rawPrice != null) {
      processPriceTick(io, msg.symbol, msg.rawPrice, {
        volume: msg.volume || 0,
        pulseFill: Boolean(msg.pulseFill),
        precomputedState: msg.state,
        fromRedis: true,
        publishRedis: false,
        matchOrders: false,
      });
    }
  });
}

function startBinanceTickStream({ symbol, io }) {
  const sym = symbol.toUpperCase();
  const room = roomName(sym, '1s');
  const key = sym;
  let timer = null;
  let depthTimer = null;
  let stopped = false;
  let tickBusy = false;
  let depthBusy = false;
  let lastTradeTime = 0;
  let depthTickCount = 0;
  const dexLike = isExternalDexPair(sym);
  const tickMs = dexLike ? DEX_TICK_POLL_MS : TICK_POLL_MS;
  const depthMs = dexLike ? Math.max(DEPTH_POLL_MS * 2, 8000) : DEPTH_POLL_MS;

  const onWsTrade = (payload) => {
    if (stopped || dexLike) return;
    if (String(payload.symbol).toUpperCase() !== sym) return;
    if (!roomHasSubscribers(io, room) && !roomHasSubscribers(io, depthRoom(sym))) return;
    if (isRedisReady() && !isMarketLeader()) return;
    recordPriceTick(sym, payload.price);
    const publishRedis = isRedisReady() && isMarketLeader();
    processPriceTick(io, sym, payload.price, { publishRedis, matchOrders: isMarketLeader() });
  };
  const offWs = onBinanceWsTrade(onWsTrade);

  const poll = async () => {
    if (stopped || tickBusy) return;
    if (!roomHasSubscribers(io, room) && !roomHasSubscribers(io, depthRoom(sym))) return;
    tickBusy = true;
    try {
      const ticker = await safeFetchTicker(sym);
      const wsLive = getWsLivePrice(sym);
      const livePrice =
        wsLive?.price > 0 && Date.now() - wsLive.time < 10_000
          ? wsLive.price
          : Number(ticker.price);
      if (!(livePrice > 0)) return;

      recordPriceTick(sym, livePrice);

      const state = resolveEffectivePrice(sym, livePrice);
      if (state.source === 'pulse') {
        processPriceTick(io, sym, livePrice, {
          pulseFill: true,
          publishRedis: isRedisReady() && isMarketLeader(),
          matchOrders: isMarketLeader(),
        });
        if (livePrice > 0) {
          processOrdersForPrice(sym, livePrice)
            .then((trades) => {
              if (trades.length) return notifySpotOrderFills(io, sym, trades, { reason: 'spot_fill' });
              return null;
            })
            .catch((err) => logStreamErr('pulse-fill', sym, err));
        }
        return;
      }

      processPriceTick(io, sym, livePrice, {
        publishRedis: isRedisReady() && isMarketLeader(),
        matchOrders: isMarketLeader(),
      });
    } catch (err) {
      logStreamErr('tick', sym, err);
    } finally {
      tickBusy = false;
    }
  };

  const pollDepthAndTrades = async () => {
    if (stopped || depthBusy) return;
    if (!roomHasSubscribers(io, depthRoom(sym)) && !roomHasSubscribers(io, room)) return;
    depthBusy = true;
    depthTickCount += 1;
    try {
      const pulseDepth = getPulseDepthOverlay(sym);
      if (pulseDepth?.bids?.length || pulseDepth?.asks?.length) {
        emitDepth(io, sym, pulseDepth);
        return;
      }

      // Dex / CG pairs are not on Binance — never hit Binance depth/trades APIs.
      if (dexLike) {
        const ticker = await safeFetchTicker(sym).catch(() => null);
        const mid = Number(ticker?.price);
        if (mid > 0) {
          emitDepth(io, sym, syntheticOrderBook(mid, 20));
        }
        return;
      }

      const wantTrades = depthTickCount % AGG_TRADE_EVERY_N === 1;
      const [depth, trades] = await Promise.all([
        fetchDepth(sym, { limit: 20 }),
        wantTrades ? fetchAggTrades(sym, { limit: 20 }) : Promise.resolve([]),
      ]);

      if (depth && (depth.bids.length || depth.asks.length)) {
        emitDepth(io, sym, depth);
      }

      for (const t of trades) {
        if (t.time <= lastTradeTime) continue;
        lastTradeTime = t.time;
        const tradePayload = {
          price: t.price,
          qty: t.qty,
          time: t.time,
          symbol: sym,
          isBuyerMaker: t.isBuyerMaker,
        };
        io.to(depthRoom(sym)).emit('market:trade', tradePayload);
        io.to(room).emit('market:trade', tradePayload);
      }
    } catch (err) {
      logStreamErr('depth', sym, err);
    } finally {
      depthBusy = false;
    }
  };

  poll();
  pollDepthAndTrades();
  timer = setInterval(poll, tickMs);
  depthTimer = setInterval(pollDepthAndTrades, depthMs);
  timer.unref?.();
  depthTimer.unref?.();

  return () => {
    stopped = true;
    offWs();
    if (timer) clearInterval(timer);
    if (depthTimer) clearInterval(depthTimer);
    aggState.delete(key);
  };
}

function startBinanceKlineStreamInternal({ symbol, interval, io }) {
  const sym = symbol.toUpperCase();
  const candleRoom = roomName(sym, interval);
  let historyTimer = null;
  let liveTimer = null;
  let stopped = false;
  let historyBusy = false;
  let liveBusy = false;
  const intervalMs = intervalToMs(interval);
  const dexLike = isExternalDexPair(sym);
  const liveMs = dexLike ? DEX_LIVE_BAR_POLL_MS : LIVE_BAR_POLL_MS;

  const source = dexLike ? 'dexscreener' : 'binance';

  const pushCandle = async (candle, { persistHistory = false } = {}) => {
    if (!candle) return;
    seedLiveCandle(sym, interval, candle);
    emitCandle(io, sym, interval, candle);
    if (persistHistory && candle.isFinal !== false) {
      persistCompletedAsync(sym, interval, { ...candle, isFinal: true }, source);
    }
  };

  const pollHistory = async () => {
    if (stopped || historyBusy) return;
    if (!roomHasSubscribers(io, candleRoom)) return;
    historyBusy = true;
    try {
      const candles = await fetchKlines(sym, interval, { limit: 5 });
      if (candles?.length) {
        const finalized = candles.filter((c) => c.isFinal !== false);
        if (finalized.length) {
          await persistMarketKlines(sym, interval, finalized, source);
        }
        const latest = candles[candles.length - 1];
        await pushCandle(latest, { persistHistory: false });
      }
    } catch (err) {
      logStreamErr(`kline:${interval}`, sym, err);
    } finally {
      historyBusy = false;
    }
  };

  const pollLiveBar = async () => {
    if (stopped || liveBusy || !intervalMs) return;
    if (!roomHasSubscribers(io, candleRoom)) return;
    liveBusy = true;
    try {
      const ticker = await safeFetchTicker(sym);
      const livePrice = Number(ticker.price);
      const state = resolveEffectivePrice(sym, livePrice);
      if (!(state.effectivePrice > 0)) return;

      if (livePrice > 0) recordPriceTick(sym, livePrice);

      const { candle, completed } = updateLiveCandle(sym, interval, state.effectivePrice, {
        pulse: state.source === 'pulse',
      });
      if (candle) emitCandle(io, sym, interval, candle);
      if (completed) persistCompletedAsync(sym, interval, completed, source);
    } catch (err) {
      logStreamErr(`live:${interval}`, sym, err);
    } finally {
      liveBusy = false;
    }
  };

  pollHistory();
  pollLiveBar();

  const historyMs = dexLike
    ? 60_000
    : interval === '1m' || interval === '5m'
      ? 30_000
      : KLINE_POLL_MS;
  historyTimer = setInterval(pollHistory, historyMs);
  liveTimer = setInterval(pollLiveBar, liveMs);
  historyTimer.unref?.();
  liveTimer.unref?.();

  return () => {
    stopped = true;
    if (historyTimer) clearInterval(historyTimer);
    if (liveTimer) clearInterval(liveTimer);
  };
}

export function ensureMarketStream(io, symbol, interval) {
  const sym = symbol.toUpperCase();
  const key = `${sym}|${interval}`;
  ensureIdlePrune(io);

  if (activeStreams.has(key)) {
    streamRefs.set(key, (streamRefs.get(key) || 1) + 1);
    return;
  }

  const stop =
    interval === '1s'
      ? startBinanceTickStream({ symbol: sym, io })
      : startBinanceKlineStreamInternal({ symbol: sym, interval, io });

  activeStreams.set(key, stop);
  streamRefs.set(key, 1);

  // Always keep 1s tick+depth stream alive when any interval is watched
  if (interval !== '1s') {
    ensureMarketStream(io, sym, '1s');
  }
}

/**
 * Join rooms + push latest cached candle/depth so the client paints instantly.
 */
export async function handleMarketSubscribe(io, socket, { symbol, interval }) {
  if (!symbol || !interval) return;
  const sym = String(symbol).toUpperCase();
  const intv = String(interval);

  socket.join(roomName(sym, intv));
  socket.join(depthRoom(sym));
  ensureMarketStream(io, sym, intv);

  const cachedCandle =
    lastCandleByKey.get(`${sym}|${intv}`) ||
    getLiveCandle(sym, intv) ||
    (isRedisReady() ? await getRedisCandle(sym, intv) : null);
  if (cachedCandle) {
    const payload = cachedCandle.symbol
      ? cachedCandle
      : { symbol: sym, interval: intv, candle: cachedCandle };
    socket.emit('market:klines:merged', payload);
  }

  const cachedDepth = lastDepthBySymbol.get(sym);
  if (cachedDepth) {
    socket.emit('market:depth', cachedDepth);
  } else {
    try {
      let depth = getPulseDepthOverlay(sym);
      if (!depth && isExternalDexPair(sym)) {
        const ticker = await safeFetchTicker(sym).catch(() => null);
        if (ticker?.price > 0) depth = syntheticOrderBook(ticker.price, 20);
      } else if (!depth) {
        depth = await fetchDepth(sym, { limit: 20 });
      }
      if (depth && (depth.bids?.length || depth.asks?.length)) {
        const payload = { symbol: sym, ...depth };
        lastDepthBySymbol.set(sym, payload);
        socket.emit('market:depth', payload);
      }
    } catch {
      /* best-effort */
    }
  }

  try {
    const ticker = await safeFetchTicker(sym);
    const state =
      (isRedisReady() ? await getLivePrice(sym) : null) ||
      resolveEffectivePrice(sym, Number(ticker.price));
    if (state.effectivePrice > 0) {
      socket.emit('market:trade', {
        symbol: sym,
        price: state.effectivePrice,
        effectivePrice: state.effectivePrice,
        binancePrice: state.binancePrice,
        qty: 0,
        time: Date.now(),
        tickerOnly: true,
        pulse: state.source === 'pulse',
      });
    }
  } catch {
    /* ignore */
  }
}

export function handleMarketUnsubscribe(socket, { symbol, interval }) {
  if (!symbol || !interval) return;
  const sym = String(symbol).toUpperCase();
  const intv = String(interval);
  socket.leave(roomName(sym, intv));

  // Soft stop: if this was the last viewer of this candle room, stop that stream soon.
  // Full prune runs on the idle timer as well.
  setTimeout(() => {
    if (!ioRef) return;
    if (!roomHasSubscribers(ioRef, roomName(sym, intv))) {
      stopMarketStream(`${sym}|${intv}`);
    }
    pruneIdleStreams(ioRef);
  }, 1500);
}

/** Call on socket disconnect so idle REST pollers stop promptly. */
export function handleMarketDisconnect(socket) {
  // Rooms are auto-left on disconnect; prune after a short delay for race safety.
  setTimeout(() => {
    if (ioRef) pruneIdleStreams(ioRef);
  }, 500);
}

/** Broadcast pulse candle + depth to all live viewers instantly. */
export function broadcastPulseToSockets(io, { symbol, intervalCandles, depth, trade }) {
  if (!io || !symbol) return;
  const sym = String(symbol).toUpperCase();

  // Emit pulse lock FIRST so clients arm before candle merges arrive
  if (trade) {
    io.emit('market:price:pulse', {
      symbol: sym,
      price: trade.price,
      fromPrice: trade.fromPrice,
      until: trade.until,
      high_24h: trade.high_24h,
      low_24h: trade.low_24h,
    });
  }

  if (depth) emitDepth(io, sym, depth);

  if (Array.isArray(intervalCandles)) {
    for (const row of intervalCandles) {
      if (!row?.interval || !row?.candle) continue;
      seedLiveCandle(sym, row.interval, row.candle);
      emitCandle(io, sym, row.interval, row.candle);
      // Also broadcast globally so Trade tab gets spike even if room subscribe raced
      io.emit('market:klines:merged', {
        symbol: sym,
        interval: row.interval,
        candle: row.candle,
      });
      io.to(depthRoom(sym)).emit('market:klines:merged', {
        symbol: sym,
        interval: row.interval,
        candle: row.candle,
      });
    }
  }

  if (trade) {
    io.to(depthRoom(sym)).emit('market:trade', {
      symbol: sym,
      price: trade.price,
      effectivePrice: trade.price,
      binancePrice: trade.fromPrice,
      ...trade,
    });
  }
}

/** @deprecated use ensureMarketStream */
export function startBinanceKlineStream() {
  return () => {};
}
