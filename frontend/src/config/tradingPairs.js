/** Must match backend/src/config/tradingPairs.js */
export const TRADING_PAIRS = [
  { symbol: 'BTCUSDT', displayPair: 'BTC/USDT' },
  { symbol: 'ETHUSDT', displayPair: 'ETH/USDT' },
  { symbol: 'BNBUSDT', displayPair: 'BNB/USDT' },
  { symbol: 'SOLUSDT', displayPair: 'SOL/USDT' },
  { symbol: 'XRPUSDT', displayPair: 'XRP/USDT' },
  { symbol: 'DOGEUSDT', displayPair: 'DOGE/USDT' },
  { symbol: 'ADAUSDT', displayPair: 'ADA/USDT' },
  { symbol: 'TRXUSDT', displayPair: 'TRX/USDT' },
];

export const TRADING_PAIR_SYMBOLS = TRADING_PAIRS.map((p) => p.symbol);
