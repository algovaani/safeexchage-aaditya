/**
 * One-shot admin price pulses: spike chart + depth once, then revert to market.
 */
const pulses = new Map();
const depthOverlays = new Map();
const revertTimers = new Map();

import { TradingPair } from '../models/TradingPair.js';

/** @returns {{ price: number, until: number, fromPrice: number, candleFix?: boolean } | null} */
export function getActivePulse(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const p = pulses.get(sym);
  if (!p) return null;
  if (!p.candleFix && Date.now() > p.until) {
    pulses.delete(sym);
    return null;
  }
  return p;
}

export function getActivePulsePrice(symbol) {
  return getActivePulse(symbol)?.price ?? null;
}

/**
 * Hold pulsed price briefly so UI shows one spike, or freeze candle indefinitely if candleFix is true.
 */
export function setPricePulse(symbol, price, { fromPrice = null, holdMs = 1500, candleFix = false } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('Invalid pulse price'), { status: 400 });
  }
  const hold = Math.max(600, Math.min(Number(holdMs) || 1500, 5000));
  const until = candleFix ? Infinity : Date.now() + hold;
  const entry = {
    price: value,
    fromPrice: Number.isFinite(Number(fromPrice)) ? Number(fromPrice) : value,
    until,
    startedAt: Date.now(),
    holdMs: candleFix ? null : hold,
    candleFix: Boolean(candleFix),
  };
  pulses.set(sym, entry);
  return entry;
}

export function clearPricePulse(symbol) {
  const sym = String(symbol || '').toUpperCase();
  pulses.delete(sym);
  const t = revertTimers.get(sym);
  if (t) {
    clearTimeout(t);
    revertTimers.delete(sym);
  }
}

export function setPulseDepthOverlay(symbol, depth, ttlMs = 1500) {
  const sym = String(symbol || '').toUpperCase();
  if (!depth?.bids?.length && !depth?.asks?.length) return;
  const ttl = Math.max(600, Math.min(Number(ttlMs) || 1500, 5000));
  depthOverlays.set(sym, {
    ...depth,
    until: Date.now() + ttl,
  });
}

export function clearPulseDepthOverlay(symbol) {
  depthOverlays.delete(String(symbol || '').toUpperCase());
}

/** @returns {{ bids: any[], asks: any[], mid: number|null, pulse?: boolean } | null} */
export function getPulseDepthOverlay(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const row = depthOverlays.get(sym);
  if (!row) return null;
  if (Date.now() > row.until) {
    depthOverlays.delete(sym);
    return null;
  }
  return row;
}

/**
 * After holdMs, clear pulse price/depth and run `onRevert` (push market data to sockets).
 */
export function schedulePulseRevert(symbol, holdMs, onRevert) {
  const sym = String(symbol || '').toUpperCase();
  const existing = revertTimers.get(sym);
  if (existing) clearTimeout(existing);

  const delay = Math.max(600, Math.min(Number(holdMs) || 1500, 5000));
  const timer = setTimeout(async () => {
    revertTimers.delete(sym);
    pulses.delete(sym);
    depthOverlays.delete(sym);
    try {
      await onRevert?.();
    } catch (err) {
      console.warn(`[pulse] revert ${sym}:`, err.message);
    }
  }, delay);
  timer.unref?.();
  revertTimers.set(sym, timer);
}

export function listActivePulses() {
  const now = Date.now();
  const rows = [];
  for (const [symbol, p] of pulses) {
    if (!p.candleFix && now > p.until) {
      pulses.delete(symbol);
      continue;
    }
    rows.push({
      symbol,
      ...p,
      candleFix: Boolean(p.candleFix),
      remainingMs: p.candleFix ? null : Math.max(0, p.until - now),
    });
  }
  return rows;
}

/**
 * On server boot: restore pairs with candleFix: true from Mongo into in-memory pulses
 */
export async function restoreCandleFixes() {
  try {
    const fixedPairs = await TradingPair.find({ candleFix: true, candleFixPrice: { $gt: 0 } }).lean();
    for (const pair of fixedPairs) {
      setPricePulse(pair.symbol, pair.candleFixPrice, {
        fromPrice: pair.candleFixFromPrice || pair.candleFixPrice,
        candleFix: true,
      });
      console.info(`[pulse] Restored candleFix for ${pair.symbol} at ${pair.candleFixPrice}`);
    }
  } catch (err) {
    console.warn('[pulse] restoreCandleFixes error:', err.message);
  }
}

