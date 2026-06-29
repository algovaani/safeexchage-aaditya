/** Map internal symbols (BTCUSDT) → CoinGecko coin id */
export const COINGECKO_IDS = {
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

export const COINGECKO_ID_TO_SYMBOL = Object.fromEntries(
  Object.entries(COINGECKO_IDS).map(([symbol, id]) => [id, symbol])
);

export function coinIdForSymbol(symbol) {
  return COINGECKO_IDS[String(symbol || '').toUpperCase()] || null;
}
