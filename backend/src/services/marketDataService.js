import { MarketData } from '../models/MarketData.js';
import { fetchKlines, fetchAggTrades, bucketTradesToSecondCandles } from './marketDataProvider.js';
import { loadManualForRange, mergeCandles } from './mergeService.js';

export async function persistMarketKlines(symbol, interval, candles) {
  const ops = candles.map((c) => ({
    updateOne: {
      filter: { symbol, interval, openTime: c.openTime },
      update: {
        $set: {
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          isFinal: c.isFinal,
          source: 'coingecko',
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await MarketData.bulkWrite(ops, { ordered: false });
}

/** @deprecated alias */
export const persistBinanceKlines = persistMarketKlines;

/**
 * Returns merged history for chart + persists raw CoinGecko rows to market_data.
 */
export async function getMergedKlines(symbol, interval, { startTime, endTime, limit = 500 }) {
  if (interval === '1s') {
    const trades = await fetchAggTrades(symbol, { limit: 1000 });
    const external = bucketTradesToSecondCandles(trades, Math.min(limit, 600));
    const start = external[0]?.openTime ?? startTime;
    const end = external[external.length - 1]?.openTime ?? endTime;
    if (start == null || end == null) return [];
    const manual = await loadManualForRange(symbol, interval, start, end);
    return mergeCandles(external, manual);
  }

  const external = await fetchKlines(symbol, interval, { startTime, endTime, limit });
  await persistMarketKlines(symbol, interval, external);

  const start = external[0]?.openTime ?? startTime;
  const end = external[external.length - 1]?.openTime ?? endTime;
  if (start == null || end == null) return [];

  const manual = await loadManualForRange(symbol, interval, start, end);
  return mergeCandles(external, manual);
}
