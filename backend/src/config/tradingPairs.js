/** Binance spot symbols (USDT quote) */
export const TRADING_PAIRS = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', displayPair: 'BTC/USDT' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', displayPair: 'ETH/USDT' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', displayPair: 'BNB/USDT' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', displayPair: 'SOL/USDT' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', displayPair: 'XRP/USDT' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', displayPair: 'DOGE/USDT' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', displayPair: 'ADA/USDT' },
  { symbol: 'TRXUSDT', baseAsset: 'TRX', quoteAsset: 'USDT', displayPair: 'TRX/USDT' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', displayPair: 'AVAX/USDT' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT', displayPair: 'LINK/USDT' },
];

export const TRADING_PAIR_SYMBOLS = TRADING_PAIRS.map((p) => p.symbol);
