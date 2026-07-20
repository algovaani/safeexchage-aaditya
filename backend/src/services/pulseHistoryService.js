import { ManualPriceData } from '../models/ManualPriceData.js';
import { MarketData } from '../models/MarketData.js';
import { fetchKlines, recordPriceTick } from './marketDataProvider.js';
import { clearPulseDepthOverlay, setPulseDepthOverlay } from './pricePulseService.js';
import { persistMarketKlinesForce } from './marketDataService.js';

const INTERVALS = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'];

const INTERVAL_MS = {
  '1s': 1000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export function alignOpenTime(ms, interval) {
  const step = INTERVAL_MS[interval] || 1000;
  return Math.floor(ms / step) * step;
}

export { INTERVALS };

export function buildPulseDepth(mid, levels = 20) {
  const price = Number(mid);
  if (!(price > 0)) return { bids: [], asks: [], mid: null };

  const bids = [];
  const asks = [];
  for (let i = 1; i <= levels; i++) {
    const step = price * (0.0012 * i);
    const qty = Number((25 / i + Math.random() * 8).toFixed(4));
    bids.push({ price: Number((price - step).toFixed(8)), qty });
    asks.push({ price: Number((price + step).toFixed(8)), qty });
  }
  return { bids, asks, mid: price, pulse: true };
}

/**
 * After pulse flash: remove temporary extremes so chart Y-scale returns to market.
 * Only touches pulse rows + current openTime buckets (never historical ATH candles).
 */
export async function finalizePulseAfterRevert(symbol, marketPrice) {
  const sym = String(symbol || '').toUpperCase();
  const px = Number(marketPrice);
  if (!sym) return;

  clearPulseDepthOverlay(sym);
  if (!(px > 0)) return;

  const now = Date.now();
  const currentOpenTimes = INTERVALS.map((interval) => alignOpenTime(now, interval));
  const hiCut = px * 1.08;
  const loCut = px * 0.92;

  await ManualPriceData.deleteMany({
    symbol: sym,
    mode: 'tick',
    $or: [{ price: { $gt: hiCut } }, { price: { $lt: loCut } }],
  });

  const dirty = await MarketData.find({
    symbol: sym,
    $or: [
      { source: 'pulse' },
      { openTime: { $in: currentOpenTimes }, high: { $gt: hiCut } },
      { openTime: { $in: currentOpenTimes }, low: { $lt: loCut } },
    ],
  }).lean();

  for (const row of dirty) {
    const o = Number(row.open);
    const c = Number(row.close);
    const open = Number.isFinite(o) && o > 0 ? o : px;
    const close = px;
    await MarketData.updateOne(
      { _id: row._id },
      {
        $set: {
          open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close,
          source: 'binance',
          isFinal: false,
        },
      }
    );
  }

  // Overwrite latest bars with real Binance OHLC
  for (const interval of INTERVALS) {
    if (interval === '1s') continue;
    try {
      const external = await fetchKlines(sym, interval, { limit: 8 });
      await persistMarketKlinesForce(sym, interval, external, 'binance');
    } catch {
      /* rate-limit — clamped current bars above still ok */
    }
  }
}

export async function clearPulseChartArtifacts(symbol, marketPrice) {
  return finalizePulseAfterRevert(symbol, marketPrice);
}

/**
 * Repair chart DB for a symbol: pull fresh Binance history (force overwrite).
 */
export async function repairMarketChartFromExchange(symbol, { limit = 500 } = {}) {
  const sym = String(symbol || '').toUpperCase();
  if (!sym) return { repaired: 0 };

  await ManualPriceData.deleteMany({
    symbol: sym,
    mode: 'tick',
  });

  await MarketData.deleteMany({ symbol: sym, source: 'pulse' });

  let repaired = 0;
  for (const interval of INTERVALS) {
    if (interval === '1s') continue;
    try {
      const external = await fetchKlines(sym, interval, { limit });
      await persistMarketKlinesForce(sym, interval, external, 'binance');
      repaired += external.length;
    } catch (err) {
      console.warn(`[repair] ${sym} ${interval}:`, err.message);
    }
  }
  return { repaired };
}

/**
 * Ephemeral pulse: depth + temp MarketData for the flash window only.
 * Extreme wick is removed on finalizePulseAfterRevert so graph scale stays usable.
 */
export async function persistPulseMarketHistory({
  symbol,
  fromPrice,
  pulsePrice,
  adminId,
  holdMs = 1500,
}) {
  const sym = String(symbol || '').toUpperCase();
  const from = Number(fromPrice);
  const to = Number(pulsePrice);
  if (!sym || !(to > 0)) return { saved: 0 };

  const hi = Math.max(Number.isFinite(from) && from > 0 ? from : to, to);
  const lo = Math.min(Number.isFinite(from) && from > 0 ? from : to, to);
  const now = Date.now();
  const openBase = Number.isFinite(from) && from > 0 ? from : to;

  for (let i = 0; i < 3; i++) recordPriceTick(sym, to);
  if (Number.isFinite(from) && from > 0) recordPriceTick(sym, from);

  const depthTtlMs = Math.max(600, Math.min(Number(holdMs) || 1500, 5000));
  const depth = buildPulseDepth(to, 20);
  setPulseDepthOverlay(sym, depth, depthTtlMs);

  const openTimes = {};
  let saved = 0;

  for (const interval of INTERVALS) {
    const openTime = alignOpenTime(now, interval);
    openTimes[interval] = openTime;

    await MarketData.findOneAndUpdate(
      { symbol: sym, interval, openTime },
      {
        $set: {
          open: openBase,
          high: hi,
          low: lo,
          close: to,
          isFinal: false,
          source: 'pulse',
          volume: 1,
        },
      },
      { upsert: true }
    );
    saved += 1;
  }

  return {
    saved,
    depth,
    high: hi,
    low: lo,
    openTimes,
    adminId: adminId || null,
  };
}
