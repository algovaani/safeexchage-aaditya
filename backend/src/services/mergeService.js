import { ManualPriceData } from '../models/ManualPriceData.js';

/**
 * Merge Binance candles with manual overrides.
 * Rule: same openTime → manual wins (latest revision for candle mode; ticks applied in order).
 */
export function mergeCandles(binanceCandles, manualDocs) {
  const byBucket = new Map();
  for (const m of manualDocs) {
    if (!byBucket.has(m.openTime)) byBucket.set(m.openTime, []);
    byBucket.get(m.openTime).push(m);
  }

  const merged = [];

  for (const b of binanceCandles) {
    let o = b.open;
    let h = b.high;
    let l = b.low;
    let c = b.close;
    let v = b.volume ?? 0;

    const list = byBucket.get(b.openTime) ?? [];
    const sorted = [...list].sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));

    for (const man of sorted) {
      if (man.mode === 'candle') {
        o = man.open ?? o;
        h = man.high ?? h;
        l = man.low ?? l;
        c = man.close ?? c;
        v = man.volume ?? v;
      } else if (man.mode === 'tick' && man.price != null) {
        c = man.price;
        h = Math.max(h, man.price);
        l = Math.min(l, man.price);
      }
    }

    merged.push({
      openTime: b.openTime,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
      isFinal: b.isFinal !== false,
    });
  }

  for (const [openTime, list] of byBucket) {
    if (binanceCandles.some((x) => x.openTime === openTime)) continue;
    const best = [...list].sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0];
    if (best.mode === 'candle') {
      merged.push({
        openTime,
        open: best.open,
        high: best.high,
        low: best.low,
        close: best.close,
        volume: best.volume ?? 0,
        isFinal: true,
      });
    }
  }

  merged.sort((a, b) => a.openTime - b.openTime);
  return merged;
}

export async function loadManualForRange(symbol, interval, start, end) {
  return ManualPriceData.find({
    symbol,
    interval,
    openTime: { $gte: start, $lte: end },
  })
    .sort({ openTime: 1, revision: 1 })
    .lean();
}
