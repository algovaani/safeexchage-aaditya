import { persistCandleExpand, getMergedCandleAt } from './marketDataService.js';
import { processOrdersForPrice, notifySpotOrderFills } from './orderEngine.js';
import {
  fetchKlines,
  fetchTicker,
  fetchDepth,
  fetchAggTrades,
  intervalToMs,
  recordPriceTick,
  clearRecentTicks,
  bucketTicksToIntervalCandles,
  syntheticOrderBook,
} from './marketDataProvider.js';
import { getActivePulsePrice, getPulseDepthOverlay } from './pricePulseService.js';
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
/** Persist/order-match throttle — avoid Mongo + order scan every tick. */
const PERSIST_THROTTLE_MS = Number(process.env.MARKET_PERSIST_THROTTLE_MS) || 2000;

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
  clearLastCandleCache(sym);
}

export { emitCandle };

const emitMergedThrottled = throttleByKey(
  async (io, _room, symbol, interval, candle) => {
    await persistCandleExpand(symbol, interval, candle, 'binance');
    const merged =
      (await getMergedCandleAt(symbol, interval, candle.openTime, candle.close)) ||
      candle;
    if (
      Number(merged.high) !== Number(candle.high) ||
      Number(merged.low) !== Number(candle.low) ||
      Number(merged.close) !== Number(candle.close)
    ) {
      emitCandle(io, symbol, interval, merged);
    }
    const trades = await processOrdersForPrice(symbol, merged.close, {
      priceHigh: merged.high,
      priceLow: merged.low,
    });
    if (trades.length) {
      await notifySpotOrderFills(io, symbol, trades);
    }
  },
  PERSIST_THROTTLE_MS
);

function pushLiveTick(io, sym, price, { pulse = false, fromPrice = null } = {}) {
  if (!(price > 0)) return;
  const bucket = Math.floor(Date.now() / 1000) * 1000;

  if (pulse) {
    const base = fromPrice > 0 ? fromPrice : price;
    emitCandle(io, sym, '1s', {
      openTime: bucket,
      open: base,
      high: Math.max(base, price),
      low: Math.min(base, price),
      close: price,
      volume: 0,
      isFinal: false,
      pulse: true,
    });
    io.to(depthRoom(sym)).emit('market:trade', {
      symbol: sym,
      price,
      qty: 0,
      time: Date.now(),
      tickerOnly: true,
      pulse: true,
    });
    return;
  }

  let st = aggState.get(sym);
  if (!st || st.openTime !== bucket) {
    st = {
      openTime: bucket,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      isFinal: false,
    };
    aggState.set(sym, st);
  } else {
    st.high = Math.max(st.high, price);
    st.low = Math.min(st.low, price);
    st.close = price;
  }

  const candle = { ...st };
  emitCandle(io, sym, '1s', candle);
  emitMergedThrottled(sym, io, roomName(sym, '1s'), sym, '1s', candle);

  io.to(depthRoom(sym)).emit('market:trade', {
    symbol: sym,
    price,
    qty: 0,
    time: Date.now(),
    tickerOnly: true,
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
    const pulsed = getActivePulsePrice(sym);
    if (pulsed != null) return;
    recordPriceTick(sym, payload.price);
    pushLiveTick(io, sym, payload.price);
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
      const pulsed = getActivePulsePrice(sym);
      const price = pulsed != null ? pulsed : livePrice;
      if (!(price > 0)) return;

      if (livePrice > 0) recordPriceTick(sym, livePrice);

      const bucket = Math.floor(Date.now() / 1000) * 1000;

      // During pulse: socket flash + fill orders at pulse price
      if (pulsed != null) {
        const base = livePrice > 0 ? livePrice : pulsed;
        emitCandle(io, sym, '1s', {
          openTime: bucket,
          open: base,
          high: Math.max(base, pulsed),
          low: Math.min(base, pulsed),
          close: pulsed,
          volume: 0,
          isFinal: false,
          pulse: true,
        });
        io.to(depthRoom(sym)).emit('market:trade', {
          symbol: sym,
          price: pulsed,
          qty: 0,
          time: Date.now(),
          tickerOnly: true,
          pulse: true,
        });
        try {
          if (livePrice > 0) {
            const liveTrades = await processOrdersForPrice(sym, livePrice);
            if (liveTrades.length) {
              await notifySpotOrderFills(io, sym, liveTrades, { reason: 'spot_fill' });
            }
          }
          const trades = await processOrdersForPrice(sym, pulsed, {
            fromPrice: base,
            rangeOnly: true,
          });
          if (trades.length) {
            await notifySpotOrderFills(io, sym, trades, { reason: 'pulse_fill' });
          }
        } catch (err) {
          logStreamErr('pulse-fill', sym, err);
        }
        return;
      }

      pushLiveTick(io, sym, price);
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
  let lastPersistAt = 0;
  const intervalMs = intervalToMs(interval);
  const dexLike = isExternalDexPair(sym);
  const liveMs = dexLike ? DEX_LIVE_BAR_POLL_MS : LIVE_BAR_POLL_MS;

  const pushCandle = async (candle, { persist = true } = {}) => {
    if (!candle) return;
    emitCandle(io, sym, interval, candle);
    if (!persist) return;
    const now = Date.now();
    if (now - lastPersistAt < PERSIST_THROTTLE_MS) return;
    lastPersistAt = now;
    await persistCandleExpand(sym, interval, candle, dexLike ? 'dexscreener' : 'binance');
    const merged =
      (await getMergedCandleAt(sym, interval, candle.openTime, candle.close)) || candle;
    if (
      Number(merged.high) !== Number(candle.high) ||
      Number(merged.low) !== Number(candle.low) ||
      Number(merged.close) !== Number(candle.close)
    ) {
      emitCandle(io, sym, interval, merged);
    }
  };

  const pollHistory = async () => {
    if (stopped || historyBusy) return;
    if (!roomHasSubscribers(io, candleRoom)) return;
    historyBusy = true;
    try {
      const candles = await fetchKlines(sym, interval, { limit: 3 });
      const latest = candles[candles.length - 1];
      await pushCandle(latest, { persist: true });
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
      const pulsed = getActivePulsePrice(sym);
      if (!(livePrice > 0) && pulsed == null) return;

      // Keep tick history on live mid only
      if (livePrice > 0) recordPriceTick(sym, livePrice);

      if (pulsed != null) {
        const openTime = Math.floor(Date.now() / intervalMs) * intervalMs;
        const base = livePrice > 0 ? livePrice : pulsed;
        emitCandle(io, sym, interval, {
          openTime,
          open: base,
          high: Math.max(base, pulsed),
          low: Math.min(base, pulsed),
          close: pulsed,
          volume: 0,
          isFinal: false,
          pulse: true,
        });
        return;
      }

      const live = bucketTicksToIntervalCandles(sym, intervalMs, 2);
      const latest = live[live.length - 1];
      if (latest) {
        await pushCandle({ ...latest, isFinal: false });
      }
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

  const cachedCandle = lastCandleByKey.get(`${sym}|${intv}`);
  if (cachedCandle) {
    socket.emit('market:klines:merged', cachedCandle);
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
    const pulsed = getActivePulsePrice(sym);
    const price = pulsed != null ? pulsed : ticker.price;
    if (price > 0) {
      socket.emit('market:trade', {
        symbol: sym,
        price,
        qty: 0,
        time: Date.now(),
        tickerOnly: true,
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
    io.to(depthRoom(sym)).emit('market:trade', { symbol: sym, ...trade });
  }
}

/** @deprecated use ensureMarketStream */
export function startBinanceKlineStream() {
  return () => {};
}
