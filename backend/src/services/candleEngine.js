/**
 * Candle Engine — in-memory OHLC for live charts.
 *
 * Live ticks update RAM only. Completed candles are flushed to MongoDB async.
 */
import { intervalToMs } from './coingeckoService.js';
import { setLiveCandleLocal, getLiveCandleLocal, clearLiveCandlesLocal, setLiveCandle } from './liveStateStore.js';

export function openTimeForInterval(interval, ts = Date.now()) {
  const ms = intervalToMs(interval) || 1000;
  return Math.floor(ts / ms) * ms;
}

/**
 * Update in-memory candle with a new effective price.
 * @returns {{ candle: object, completed: object|null }}
 */
export function updateLiveCandle(symbol, interval, price, { volume = 0, pulse = false } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const intv = String(interval || '1s').toLowerCase();
  const px = Number(price);
  if (!(px > 0)) return { candle: null, completed: null };

  const openTime = openTimeForInterval(intv);
  let existing = getLiveCandleLocal(sym, intv);
  let completed = null;

  if (!existing || existing.openTime !== openTime) {
    if (existing && !existing.isFinal) {
      completed = { ...existing, isFinal: true };
    }
    existing = {
      openTime,
      open: px,
      high: px,
      low: px,
      close: px,
      volume: Number(volume) || 0,
      isFinal: false,
      pulse: Boolean(pulse),
    };
  } else {
    existing.high = Math.max(existing.high, px);
    existing.low = Math.min(existing.low, px);
    existing.close = px;
    existing.volume = (existing.volume || 0) + (Number(volume) || 0);
    if (pulse) existing.pulse = true;
  }

  setLiveCandleLocal(sym, intv, existing);
  setLiveCandle(sym, intv, existing);
  return { candle: { ...existing }, completed };
}

/** Read current in-memory candle (no DB). */
export function getLiveCandle(symbol, interval) {
  const c = getLiveCandleLocal(symbol, interval);
  return c ? { ...c } : null;
}

/** Clear live candles for symbol (after pulse reset, etc.). */
export function clearLiveCandles(symbol, interval = null) {
  clearLiveCandlesLocal(symbol, interval);
}

/** Seed in-memory candle from DB/history on subscribe (optional). */
export function seedLiveCandle(symbol, interval, candle) {
  if (!candle?.openTime) return;
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  if (![open, high, low, close].every(Number.isFinite)) return;
  setLiveCandleLocal(symbol, interval, {
    openTime: candle.openTime,
    open,
    high: Math.max(open, high, close),
    low: Math.min(open, low, close),
    close,
    volume: Number(candle.volume) || 0,
    isFinal: false,
    pulse: Boolean(candle.pulse),
  });
}
