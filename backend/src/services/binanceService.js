/**
 * Market data facade — Kraken + CoinGecko (no Binance).
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
  bucketTradesToSecondCandles,
  parseKlineEvent,
  syntheticOrderBook,
  getPriceCacheTtlMs,
  getActiveProvider,
} from './marketDataProvider.js';
