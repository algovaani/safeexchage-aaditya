/** Must match backend/src/config/tradingPairs.js */
const CG = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  BNBUSDT: 'binancecoin',
  SOLUSDT: 'solana',
  XRPUSDT: 'ripple',
  DOGEUSDT: 'dogecoin',
  ADAUSDT: 'cardano',
  TRXUSDT: 'tron',
  POLUSDT: 'polygon-ecosystem-token',
};

export const TRADING_PAIRS = [
  { symbol: 'BTCUSDT', displayPair: 'BTC/USDT', baseAsset: 'BTC', coingeckoId: CG.BTCUSDT },
  { symbol: 'ETHUSDT', displayPair: 'ETH/USDT', baseAsset: 'ETH', coingeckoId: CG.ETHUSDT },
  { symbol: 'BNBUSDT', displayPair: 'BNB/USDT', baseAsset: 'BNB', coingeckoId: CG.BNBUSDT },
  { symbol: 'SOLUSDT', displayPair: 'SOL/USDT', baseAsset: 'SOL', coingeckoId: CG.SOLUSDT },
  { symbol: 'XRPUSDT', displayPair: 'XRP/USDT', baseAsset: 'XRP', coingeckoId: CG.XRPUSDT },
  { symbol: 'DOGEUSDT', displayPair: 'DOGE/USDT', baseAsset: 'DOGE', coingeckoId: CG.DOGEUSDT },
  { symbol: 'ADAUSDT', displayPair: 'ADA/USDT', baseAsset: 'ADA', coingeckoId: CG.ADAUSDT },
  { symbol: 'TRXUSDT', displayPair: 'TRX/USDT', baseAsset: 'TRX', coingeckoId: CG.TRXUSDT },
  { symbol: 'POLUSDT', displayPair: 'POL/USDT', baseAsset: 'POL', category: 'crypto', quoteAsset: 'USDT', coingeckoId: CG.POLUSDT },
  { symbol: 'GOLDINR', displayPair: 'GOLD/INR', baseAsset: 'GOLD', category: 'commodity', quoteAsset: 'INR', name: 'Gold', unit: 'g' },
  { symbol: 'SILVERINR', displayPair: 'SILVER/INR', baseAsset: 'SILVER', category: 'commodity', quoteAsset: 'INR', name: 'Silver', unit: 'g' },
];

export const TRADING_PAIR_SYMBOLS = TRADING_PAIRS.map((p) => p.symbol);
