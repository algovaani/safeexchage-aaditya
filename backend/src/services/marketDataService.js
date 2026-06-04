import { MarketData } from '../models/MarketData.js';
import { fetchKlines, fetchAggTrades, bucketTradesToSecondCandles } from './binanceService.js';
import { loadManualForRange, mergeCandles } from './mergeService.js';

export async function persistBinanceKlines(symbol, interval, candles) {
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
          source: 'binance',
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await MarketData.bulkWrite(ops, { ordered: false });
}

/**
 * Returns merged history for chart + persists raw Binance rows to market_data.
 */
export async function getMergedKlines(symbol, interval, { startTime, endTime, limit = 500 }) {
  if (interval === '1s') {
    const trades = await fetchAggTrades(symbol, { limit: 1000 });
    const binance = bucketTradesToSecondCandles(trades, Math.min(limit, 600));
    const start = binance[0]?.openTime ?? startTime;
    const end = binance[binance.length - 1]?.openTime ?? endTime;
    if (start == null || end == null) return [];
    const manual = await loadManualForRange(symbol, interval, start, end);
    return mergeCandles(binance, manual);
  }

  const binance = await fetchKlines(symbol, interval, { startTime, endTime, limit });
  await persistBinanceKlines(symbol, interval, binance);

  const start = binance[0]?.openTime ?? startTime;
  const end = binance[binance.length - 1]?.openTime ?? endTime;
  if (start == null || end == null) return [];

  const manual = await loadManualForRange(symbol, interval, start, end);
  return mergeCandles(binance, manual);
}
