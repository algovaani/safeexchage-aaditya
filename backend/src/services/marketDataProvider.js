/**
 * Unified market data — Kraken primary (real candles, global), CoinGecko fallback.
 * Set MARKET_DATA_PROVIDER=coingecko to force CoinGecko only.
 */
import * as coingecko from './coingeckoService.js';
import { krakenIntervalMinutes, isKrakenSupported } from './krakenService.js';

const PROVIDER = String(process.env.MARKET_DATA_PROVIDER || 'kraken').toLowerCase();

function useKraken() {
  return PROVIDER === 'kraken' || PROVIDER === 'auto';
}

async function withFallback(krakenFn, coingeckoFn, label) {
  if (!useKraken()) {
    return coingeckoFn();
  }
  try {
    const result = await krakenFn();
    return { ...result, provider: result.provider || 'kraken' };
  } catch (err) {
    console.warn(`[market] Kraken ${label} failed (${err.message}) — using CoinGecko`);
    const result = await coingeckoFn();
    return { ...result, provider: 'coingecko', fallback: true };
  }
}

async function krakenFetch(fn) {
  const kraken = await import('./krakenService.js');
  return fn(kraken);
}

export const normalizeSymbol = coingecko.normalizeSymbol;
export const toDisplayPair = coingecko.toDisplayPair;
export const intervalToMs = coingecko.intervalToMs;
export const recordPriceTick = coingecko.recordPriceTick;
export const bucketRecentPricesToSecondCandles = coingecko.bucketRecentPricesToSecondCandles;
export const bucketTicksToIntervalCandles = coingecko.bucketTicksToIntervalCandles;
export const bucketTradesToSecondCandles = coingecko.bucketTradesToSecondCandles;
export const parseKlineEvent = coingecko.parseKlineEvent;
export const syntheticOrderBook = coingecko.syntheticOrderBook;
export const getPriceCacheTtlMs = coingecko.getPriceCacheTtlMs;

export async function fetchAllPairPrices(opts = {}) {
  const result = await withFallback(
    () => krakenFetch((k) => k.fetchAllPairPrices(opts)),
    () => coingecko.fetchAllPairPrices(opts),
    'prices'
  );

  if (!useKraken() || result.provider === 'coingecko') {
    return result;
  }

  const { TRADING_PAIR_SYMBOLS } = await import('../config/tradingPairs.js');
  const got = new Set(result.pairs.map((p) => p.symbol));
  const missing = TRADING_PAIR_SYMBOLS.filter((s) => !got.has(s));
  if (!missing.length) return result;

  try {
    const cg = await coingecko.fetchAllPairPrices(opts);
    const fill = cg.pairs.filter((p) => missing.includes(p.symbol));
    return {
      ...result,
      pairs: [...result.pairs, ...fill.map((p) => ({ ...p, provider: 'coingecko' }))],
      mixed: true,
    };
  } catch {
    return result;
  }
}

export async function fetchTicker(symbol, opts = {}) {
  if (!useKraken() || !isKrakenSupported(symbol)) {
    return coingecko.fetchTicker(symbol, opts);
  }
  try {
    const kraken = await import('./krakenService.js');
    const row = await kraken.fetchTicker(symbol);
    coingecko.recordPriceTick(row.symbol, row.price);
    return row;
  } catch {
    return coingecko.fetchTicker(symbol, opts);
  }
}

export async function fetchPriceMap(opts = {}) {
  const result = await fetchAllPairPrices(opts);
  const prices = {};
  for (const row of result.pairs) {
    prices[row.symbol] = row.price;
  }
  return { prices, stale: result.stale, updatedAt: result.updatedAt, provider: result.provider };
}

export async function fetchTicker24h(symbol) {
  const row = await fetchTicker(symbol);
  return {
    symbol: row.symbol,
    lastPrice: row.price,
    priceChange: null,
    priceChangePercent: row.change_24h,
    highPrice: row.high_24h,
    lowPrice: row.low_24h,
    volume: row.volume,
    quoteVolume: row.quoteVolume,
  };
}

export async function fetchKlines(symbol, interval, opts = {}) {
  if (interval === '1s') {
    return coingecko.fetchKlines(symbol, interval, opts);
  }

  if (useKraken() && isKrakenSupported(symbol) && krakenIntervalMinutes(interval)) {
    try {
      const kraken = await import('./krakenService.js');
      const candles = await kraken.fetchKlines(symbol, interval, opts);
      if (candles.length) {
        const sym = normalizeSymbol(symbol);
        for (const c of candles.slice(-5)) {
          coingecko.recordPriceTick(sym, c.close);
        }
        return candles;
      }
    } catch (err) {
      console.warn(`[market] Kraken klines ${symbol} ${interval}: ${err.message} — CoinGecko`);
    }
  }

  return coingecko.fetchKlines(symbol, interval, opts);
}

export async function fetchAggTrades(symbol, opts = {}) {
  return coingecko.fetchAggTrades(symbol, opts);
}

export function getActiveProvider() {
  return PROVIDER;
}
