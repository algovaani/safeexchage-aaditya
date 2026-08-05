import { persistCandleExpand, getMergedCandleAt } from './marketDataService.js';
import { processOrdersForPrice } from './orderEngine.js';
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

const TICK_POLL_MS = Number(process.env.MARKET_STREAM_POLL_MS) || 1000;
const DEX_TICK_POLL_MS = Number(process.env.MARKET_DEX_STREAM_POLL_MS) || 4000;
const KLINE_POLL_MS = Number(process.env.MARKET_KLINE_POLL_MS) || 10_000;
const LIVE_BAR_POLL_MS = Number(process.env.MARKET_LIVE_BAR_MS) || 1000;
const DEX_LIVE_BAR_POLL_MS = Number(process.env.MARKET_DEX_LIVE_BAR_MS) || 3000;
const DEPTH_POLL_MS = Number(process.env.MARKET_DEPTH_POLL_MS) || 1000;

const activeStreams = new Map();
const aggState = new Map();
/** Last depth emitted per symbol — used for instant snapshot on subscribe */
const lastDepthBySymbol = new Map();
const lastCandleByKey = new Map();
/** Throttle identical error logs per symbol */
const lastStreamErrAt = new Map();

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
    emitCandle(io, symbol, interval, merged);
    await processOrdersForPrice(symbol, merged.close);
  },
  50
);

function startBinanceTickStream({ symbol, io }) {
  const sym = symbol.toUpperCase();
  const room = roomName(sym, '1s');
  const key = sym;
  let timer = null;
  let depthTimer = null;
  let stopped = false;
  let lastTradeTime = 0;
  const dexLike = isExternalDexPair(sym);
  const tickMs = dexLike ? DEX_TICK_POLL_MS : TICK_POLL_MS;
  const depthMs = dexLike ? Math.max(DEPTH_POLL_MS * 3, 3000) : DEPTH_POLL_MS;

  const poll = async () => {
    if (stopped) return;
    try {
      const ticker = await safeFetchTicker(sym);
      const livePrice = Number(ticker.price);
      const pulsed = getActivePulsePrice(sym);
      const price = pulsed != null ? pulsed : livePrice;
      if (!(price > 0)) return;

      // Never record pulse spike into tick buckets / DB — only live mid
      if (livePrice > 0) recordPriceTick(sym, livePrice);

      const bucket = Math.floor(Date.now() / 1000) * 1000;

      // During pulse: socket-only flash (no MarketData persist) so chart can resume cleanly
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
        return;
      }

      let st = aggState.get(key);
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
        aggState.set(key, st);
      } else {
        st.high = Math.max(st.high, price);
        st.low = Math.min(st.low, price);
        st.close = price;
      }

      const candle = { ...st };
      emitMergedThrottled(key, io, room, sym, '1s', candle);

      io.to(depthRoom(sym)).emit('market:trade', {
        symbol: sym,
        price,
        qty: 0,
        time: Date.now(),
        tickerOnly: true,
      });
    } catch (err) {
      logStreamErr('tick', sym, err);
    }
  };

  const pollDepthAndTrades = async () => {
    if (stopped) return;
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

      const [depth, trades] = await Promise.all([
        fetchDepth(sym, { limit: 20 }),
        fetchAggTrades(sym, { limit: 20 }),
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
    if (timer) clearInterval(timer);
    if (depthTimer) clearInterval(depthTimer);
    aggState.delete(key);
  };
}

function startBinanceKlineStreamInternal({ symbol, interval, io }) {
  const sym = symbol.toUpperCase();
  let historyTimer = null;
  let liveTimer = null;
  let stopped = false;
  const intervalMs = intervalToMs(interval);
  const dexLike = isExternalDexPair(sym);
  const liveMs = dexLike ? DEX_LIVE_BAR_POLL_MS : LIVE_BAR_POLL_MS;

  const pushCandle = async (candle) => {
    if (!candle) return;
    await persistCandleExpand(sym, interval, candle, dexLike ? 'dexscreener' : 'binance');
    const merged =
      (await getMergedCandleAt(sym, interval, candle.openTime, candle.close)) || candle;
    emitCandle(io, sym, interval, merged);
  };

  const pollHistory = async () => {
    if (stopped) return;
    try {
      const candles = await fetchKlines(sym, interval, { limit: 3 });
      const latest = candles[candles.length - 1];
      await pushCandle(latest);
    } catch (err) {
      logStreamErr(`kline:${interval}`, sym, err);
    }
  };

  const pollLiveBar = async () => {
    if (stopped || !intervalMs) return;
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
  if (activeStreams.has(key)) return;

  const stop =
    interval === '1s'
      ? startBinanceTickStream({ symbol: sym, io })
      : startBinanceKlineStreamInternal({ symbol: sym, interval, io });

  activeStreams.set(key, stop);

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
  socket.leave(roomName(symbol, interval));
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
