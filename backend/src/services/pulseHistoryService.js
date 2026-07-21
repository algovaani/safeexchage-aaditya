import { ManualPriceData } from '../models/ManualPriceData.js';
import { MarketData } from '../models/MarketData.js';
import { clearPulseDepthOverlay, setPulseDepthOverlay } from './pricePulseService.js';

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
 * After pulse flash: remove temporary extremes, restore live market OHLC so chart
 * scale stays usable and candles keep designing around real price.
 * Order fills already happened during the pulse — chart does not keep a permanent wick.
 */
export async function finalizePulseAfterRevert(symbol, marketPrice, { openTimes } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const px = Number(marketPrice);
  clearPulseDepthOverlay(sym);
  if (!sym || !(px > 0)) return { restored: 0 };

  const { fetchKlines } = await import('./marketDataProvider.js');
  const { persistMarketKlinesForce } = await import('./marketDataService.js');

  const times = openTimes ? Object.values(openTimes).filter((t) => Number.isFinite(t)) : [];
  if (times.length) {
    await ManualPriceData.deleteMany({ symbol: sym, openTime: { $in: times } });
  }

  // Drop any leftover extreme manuals vs live price (e.g. pulse 200 then 600)
  await ManualPriceData.deleteMany({
    symbol: sym,
    $or: [{ high: { $gt: px * 1.06 } }, { low: { $lt: px * 0.94 } }, { price: { $gt: px * 1.06 } }, { price: { $lt: px * 0.94 } }],
  });

  await MarketData.deleteMany({ symbol: sym, source: 'pulse' });

  let restored = 0;
  for (const interval of INTERVALS) {
    const openTime = openTimes?.[interval] ?? alignOpenTime(Date.now(), interval);
    if (interval === '1s') {
      await MarketData.findOneAndUpdate(
        { symbol: sym, interval, openTime },
        {
          $set: {
            open: px,
            high: px,
            low: px,
            close: px,
            volume: 0,
            isFinal: false,
            source: 'binance',
          },
        },
        { upsert: true }
      );
      restored += 1;
      continue;
    }

    try {
      const external = await fetchKlines(sym, interval, { limit: 3 });
      if (external?.length) {
        await persistMarketKlinesForce(sym, interval, external, 'binance');
        restored += external.length;
      } else {
        await MarketData.findOneAndUpdate(
          { symbol: sym, interval, openTime },
          {
            $set: {
              open: px,
              high: px,
              low: px,
              close: px,
              isFinal: false,
              source: 'binance',
            },
          },
          { upsert: true }
        );
        restored += 1;
      }
    } catch {
      await MarketData.findOneAndUpdate(
        { symbol: sym, interval, openTime },
        {
          $set: {
            open: px,
            high: px,
            low: px,
            close: px,
            isFinal: false,
            source: 'binance',
          },
        },
        { upsert: true }
      );
      restored += 1;
    }
  }

  return { restored };
}

export async function clearPulseChartArtifacts(symbol, marketPrice) {
  return finalizePulseAfterRevert(symbol, marketPrice);
}

/**
 * Repair chart DB for a symbol: pull fresh Binance history (force overwrite).
 */
export async function repairMarketChartFromExchange(symbol, { limit = 500 } = {}) {
  const { fetchKlines } = await import('./marketDataProvider.js');
  const { persistMarketKlinesForce } = await import('./marketDataService.js');

  const sym = String(symbol || '').toUpperCase();
  if (!sym) return { repaired: 0 };

  await ManualPriceData.deleteMany({ symbol: sym });
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
 * Temporary pulse flash in MarketData (source:'pulse').
 * Extreme wick is removed on finalize — order matching uses in-memory from→to path.
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

  const { recordPriceTick } = await import('./marketDataProvider.js');

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
  const candles = [];

  for (const interval of INTERVALS) {
    const openTime = alignOpenTime(now, interval);
    openTimes[interval] = openTime;

    const existing = await MarketData.findOne({ symbol: sym, interval, openTime }).lean();
    // Keep real open for the bar; only flash high/low/close for the pulse window
    const open =
      existing && Number(existing.open) > 0 && existing.source !== 'pulse'
        ? Number(existing.open)
        : openBase;
    const high = Math.max(Number(existing?.high) || 0, hi, open, to);
    const low = Math.min(
      Number(existing?.low) > 0 && existing?.source !== 'pulse' ? Number(existing.low) : lo,
      lo,
      open,
      to
    );

    const doc = await MarketData.findOneAndUpdate(
      { symbol: sym, interval, openTime },
      {
        $set: {
          open,
          high,
          low,
          close: to,
          isFinal: false,
          source: 'pulse',
          volume: Math.max(Number(existing?.volume) || 0, 1),
        },
      },
      { upsert: true, new: true }
    ).lean();

    saved += 1;
    candles.push({
      interval,
      candle: {
        openTime,
        open: doc.open,
        high: doc.high,
        low: doc.low,
        close: doc.close,
        volume: doc.volume || 1,
        isFinal: false,
        pulse: true,
      },
    });
  }

  return {
    saved,
    depth,
    high: hi,
    low: lo,
    openTimes,
    candles,
    adminId: adminId || null,
  };
}
