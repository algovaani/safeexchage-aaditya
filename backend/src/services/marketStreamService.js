import { persistCandleExpand, getMergedCandleAt } from './marketDataService.js';
import { processOrdersForPrice } from './orderEngine.js';
import {
  fetchKlines,
  fetchTicker,
  fetchDepth,
  fetchAggTrades,
  intervalToMs,
  recordPriceTick,
  bucketTicksToIntervalCandles,
} from './marketDataProvider.js';
import { getActivePulsePrice, getPulseDepthOverlay } from './pricePulseService.js';

const TICK_POLL_MS = Number(process.env.MARKET_STREAM_POLL_MS) || 1000;
const KLINE_POLL_MS = Number(process.env.MARKET_KLINE_POLL_MS) || 10_000;
const LIVE_BAR_POLL_MS = Number(process.env.MARKET_LIVE_BAR_MS) || 1000;
const DEPTH_POLL_MS = Number(process.env.MARKET_DEPTH_POLL_MS) || 1000;

const activeStreams = new Map();
const aggState = new Map();
/** Last depth emitted per symbol — used for instant snapshot on subscribe */
const lastDepthBySymbol = new Map();
const lastCandleByKey = new Map();

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

  const poll = async () => {
    if (stopped) return;
    try {
      const ticker = await fetchTicker(sym);
      const livePrice = ticker.price;
      const pulsed = getActivePulsePrice(sym);
      const price = pulsed != null ? pulsed : livePrice;
      recordPriceTick(sym, price);

      const bucket = Math.floor(Date.now() / 1000) * 1000;
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
      console.error(`[binanceStream] tick ${sym}:`, err.message);
    }
  };

  const pollDepthAndTrades = async () => {
    if (stopped) return;
    try {
      const pulseDepth = getPulseDepthOverlay(sym);
      if (pulseDepth?.bids?.length || pulseDepth?.asks?.length) {
        emitDepth(io, sym, pulseDepth);
      }

      const [depth, trades] = await Promise.all([
        pulseDepth ? Promise.resolve(null) : fetchDepth(sym, { limit: 20 }),
        fetchAggTrades(sym, { limit: 20 }),
      ]);

      if (!pulseDepth && depth && (depth.bids.length || depth.asks.length)) {
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
      console.error(`[binanceStream] depth/trades ${sym}:`, err.message);
    }
  };

  poll();
  pollDepthAndTrades();
  timer = setInterval(poll, TICK_POLL_MS);
  depthTimer = setInterval(pollDepthAndTrades, DEPTH_POLL_MS);
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

  const pushCandle = async (candle) => {
    if (!candle) return;
    await persistCandleExpand(sym, interval, candle, 'binance');
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
      console.error(`[binanceStream] kline ${sym} ${interval}:`, err.message);
    }
  };

  const pollLiveBar = async () => {
    if (stopped || !intervalMs) return;
    try {
      const ticker = await fetchTicker(sym);
      const pulsed = getActivePulsePrice(sym);
      const price = pulsed != null ? pulsed : ticker.price;
      recordPriceTick(sym, price);
      const live = bucketTicksToIntervalCandles(sym, intervalMs, 2);
      const latest = live[live.length - 1];
      if (latest) {
        await pushCandle({ ...latest, isFinal: false });
      }
    } catch (err) {
      console.error(`[binanceStream] live bar ${sym} ${interval}:`, err.message);
    }
  };

  pollHistory();
  pollLiveBar();

  const historyMs = interval === '1m' || interval === '5m' ? 30_000 : KLINE_POLL_MS;
  historyTimer = setInterval(pollHistory, historyMs);
  liveTimer = setInterval(pollLiveBar, LIVE_BAR_POLL_MS);
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
      const depth = getPulseDepthOverlay(sym) || (await fetchDepth(sym, { limit: 20 }));
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
    const ticker = await fetchTicker(sym);
    const pulsed = getActivePulsePrice(sym);
    const price = pulsed != null ? pulsed : ticker.price;
    socket.emit('market:trade', {
      symbol: sym,
      price,
      qty: 0,
      time: Date.now(),
      tickerOnly: true,
    });
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

  if (depth) emitDepth(io, sym, depth);

  if (Array.isArray(intervalCandles)) {
    for (const row of intervalCandles) {
      if (!row?.interval || !row?.candle) continue;
      emitCandle(io, sym, row.interval, row.candle);
    }
  }

  if (trade) {
    io.to(depthRoom(sym)).emit('market:trade', { symbol: sym, ...trade });
    io.emit('market:price:pulse', {
      symbol: sym,
      price: trade.price,
      fromPrice: trade.fromPrice,
      until: trade.until,
    });
    // Also push candle on depth room so chart clients always get the spike
    // even if interval room subscription is delayed
    if (Array.isArray(intervalCandles)) {
      for (const row of intervalCandles) {
        if (!row?.interval || !row?.candle) continue;
        io.to(depthRoom(sym)).emit('market:klines:merged', {
          symbol: sym,
          interval: row.interval,
          candle: row.candle,
        });
      }
    }
  }
}

/** @deprecated use ensureMarketStream */
export function startBinanceKlineStream() {
  return () => {};
}
