/**
 * Market data facade — Binance public REST (single source of truth).
 */
export {
  normalizeSymbol,
  toDisplayPair,
  intervalToMs,
  recordPriceTick,
  bucketRecentPricesToSecondCandles,
  bucketTicksToIntervalCandles,
  fetchTicker,
  fetchAllPairPrices,
  fetchPriceMap,
  fetchTicker24h,
  fetchKlines,
  fetchAggTrades,
  fetchDepth,
  bucketTradesToSecondCandles,
  parseKlineEvent,
  syntheticOrderBook,
  getPriceCacheTtlMs,
  getActiveProvider,
} from './marketDataProvider.js';
