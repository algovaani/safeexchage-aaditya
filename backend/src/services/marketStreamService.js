import { MarketData } from '../models/MarketData.js';
import { loadManualForRange, mergeCandles } from './mergeService.js';
import { processOrdersForPrice } from './orderEngine.js';
import {
  fetchKlines,
  fetchTicker,
  intervalToMs,
  recordPriceTick,
  bucketTicksToIntervalCandles,
  syntheticOrderBook,
} from './marketDataProvider.js';

const TICK_POLL_MS = Number(process.env.COINGECKO_STREAM_POLL_MS) || 3000;
const KLINE_POLL_MS = Number(process.env.COINGECKO_KLINE_POLL_MS) || 45_000;
const LIVE_BAR_POLL_MS = Number(process.env.COINGECKO_LIVE_BAR_MS) || 3000;

const activeStreams = new Map();
const aggState = new Map();

export function roomName(symbol, interval) {
  return `m:${symbol.toUpperCase()}:${interval}`;
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

const emitMergedThrottled = throttleByKey(
  async (io, room, symbol, interval, candle) => {
    const manual = await loadManualForRange(symbol, interval, candle.openTime, candle.openTime);
    const [merged] = mergeCandles([candle], manual);
    if (!merged) return;
    io.to(room).emit('market:klines:merged', { symbol, interval, candle: merged });
    await processOrdersForPrice(symbol, merged.close);
  },
  80
);

async function persistCandle(symbol, interval, candle) {
  await MarketData.findOneAndUpdate(
    { symbol, interval, openTime: candle.openTime },
    {
      $set: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        isFinal: candle.isFinal,
        source: 'coingecko',
      },
    },
    { upsert: true }
  );
}

function startCoinGeckoTickStream({ symbol, io }) {
  const sym = symbol.toUpperCase();
  const room = roomName(sym, '1s');
  const key = sym;
  let timer = null;
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const ticker = await fetchTicker(sym);
      const price = ticker.price;
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
      await persistCandle(sym, '1s', candle);

      const depth = syntheticOrderBook(price);
      io.to(room).emit('market:depth', { symbol: sym, ...depth });
      io.to(room).emit('market:trade', {
        price,
        qty: +(Math.random() * 0.5 + 0.01).toFixed(4),
        time: Date.now(),
        symbol: sym,
        isBuyerMaker: Math.random() > 0.5,
      });
    } catch (err) {
      console.error(`[coingeckoStream] tick ${sym}:`, err.message);
    }
  };

  poll();
  timer = setInterval(poll, TICK_POLL_MS);
  timer.unref?.();

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    aggState.delete(key);
  };
}

function startCoinGeckoKlineStream({ symbol, interval, io }) {
  const sym = symbol.toUpperCase();
  const room = roomName(sym, interval);
  let historyTimer = null;
  let liveTimer = null;
  let stopped = false;
  const intervalMs = intervalToMs(interval);

  const emitCandle = async (candle) => {
    if (!candle) return;
    await persistCandle(sym, interval, candle);
    const manual = await loadManualForRange(sym, interval, candle.openTime, candle.openTime);
    const [merged] = mergeCandles([candle], manual);
    if (!merged) return;
    io.to(room).emit('market:klines:merged', { symbol: sym, interval, candle: merged });
  };

  const pollHistory = async () => {
    if (stopped) return;
    try {
      const candles = await fetchKlines(sym, interval, { limit: 3 });
      const latest = candles[candles.length - 1];
      await emitCandle(latest);
    } catch (err) {
      console.error(`[coingeckoStream] kline ${sym} ${interval}:`, err.message);
    }
  };

  const pollLiveBar = async () => {
    if (stopped || !intervalMs) return;
    try {
      const ticker = await fetchTicker(sym);
      recordPriceTick(sym, ticker.price);
      const live = bucketTicksToIntervalCandles(sym, intervalMs, 2);
      const latest = live[live.length - 1];
      if (latest) {
        await emitCandle({ ...latest, isFinal: false });
      }
    } catch (err) {
      console.error(`[coingeckoStream] live bar ${sym} ${interval}:`, err.message);
    }
  };

  pollHistory();
  pollLiveBar();

  const historyMs = interval === '1m' || interval === '5m' ? 60_000 : KLINE_POLL_MS;
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
      ? startCoinGeckoTickStream({ symbol: sym, io })
      : startCoinGeckoKlineStream({ symbol: sym, interval, io });

  activeStreams.set(key, stop);
}

/** @deprecated use ensureMarketStream */
export function startBinanceKlineStream() {
  return () => {};
}
