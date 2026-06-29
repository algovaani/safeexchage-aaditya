/** Internal symbol → Kraken pair name (USD quote, works globally). */
export const KRAKEN_PAIRS = {
  BTCUSDT: 'XBTUSD',
  ETHUSDT: 'ETHUSD',
  BNBUSDT: 'BNBUSD',
  SOLUSDT: 'SOLUSD',
  XRPUSDT: 'XRPUSD',
  DOGEUSDT: 'XDGUSD',
  ADAUSDT: 'ADAUSD',
  TRXUSDT: 'TRXUSD',
  POLUSDT: 'POLUSD',
};

export function krakenPairForSymbol(symbol) {
  return KRAKEN_PAIRS[String(symbol || '').toUpperCase()] || null;
}

/** Kraken OHLC interval in minutes */
export function krakenIntervalMinutes(interval) {
  const map = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
    '1D': 1440,
    '1w': 10080,
  };
  return map[String(interval || '').toLowerCase()] || null;
}
