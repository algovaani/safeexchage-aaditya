import axios from 'axios';
import { TRADING_PAIR_SYMBOLS } from '../config/tradingPairs.js';
import { krakenIntervalMinutes, krakenPairForSymbol } from '../config/krakenPairs.js';

function toDisplayPair(symbol) {
  const upper = String(symbol).toUpperCase();
  if (upper.endsWith('USDT')) return `${upper.slice(0, -4)}/USDT`;
  return upper;
}

function normalizeSymbol(input) {
  const raw = String(input).toUpperCase().trim().replace(/\//g, '');
  if (TRADING_PAIR_SYMBOLS.includes(raw)) return raw;
  return raw.endsWith('USDT') ? raw : `${raw}USDT`;
}

function findTickerKey(requestedPair, resultKeys) {
  const req = requestedPair.toUpperCase();
  return resultKeys.find((k) => {
    const ku = k.toUpperCase();
    if (req === 'XBTUSD') return ku.includes('XBT') && ku.includes('USD');
    if (req === 'XDGUSD') return ku.includes('XDG') || ku.includes('DOGE');
    const asset = req.replace('USD', '');
    return ku.includes(asset) && ku.includes('USD');
  });
}

const REST = (process.env.KRAKEN_API_URL || 'https://api.kraken.com').replace(/\/$/, '');
const CACHE_TTL_MS = Number(process.env.KRAKEN_PRICE_CACHE_MS) || 5000;

let priceCache = { pairs: null, fetchedAt: 0, stale: false };

async function krakenGet(path, params = {}) {
  const { data } = await axios.get(`${REST}${path}`, {
    params,
    timeout: 20_000,
    validateStatus: () => true,
  });

  if (data?.error?.length) {
    throw new Error(data.error.join('; '));
  }
  return data?.result || {};
}

function mapTickerRow(symbol, pairKey, ticker) {
  const last = Number(ticker?.c?.[0]);
  if (!Number.isFinite(last) || last <= 0) return null;

  const open = Number(ticker?.o);
  const high = Number(ticker?.h?.[1] ?? ticker?.h?.[0]);
  const low = Number(ticker?.l?.[1] ?? ticker?.l?.[0]);
  const vol = Number(ticker?.v?.[1] ?? ticker?.v?.[0]);
  const changePct = Number.isFinite(open) && open > 0 ? ((last - open) / open) * 100 : 0;

  return {
    symbol,
    pair: toDisplayPair(symbol),
    price: last,
    change_24h: changePct,
    high_24h: Number.isFinite(high) ? high : last,
    low_24h: Number.isFinite(low) ? low : last,
    volume: Number.isFinite(vol) ? vol : 0,
    quoteVolume: Number.isFinite(vol) ? vol * last : 0,
    provider: 'kraken',
    krakenPair: pairKey,
  };
}

export { krakenIntervalMinutes };
export function isKrakenSupported(symbol) {
  return Boolean(krakenPairForSymbol(symbol));
}

export async function fetchAllPairPrices({ force = false } = {}) {
  const now = Date.now();
  if (!force && priceCache.pairs && now - priceCache.fetchedAt < CACHE_TTL_MS) {
    return {
      pairs: priceCache.pairs,
      stale: priceCache.stale,
      updatedAt: new Date(priceCache.fetchedAt).toISOString(),
      provider: 'kraken',
    };
  }

  const pairList = TRADING_PAIR_SYMBOLS.map((s) => krakenPairForSymbol(s)).filter(Boolean);
  const result = await krakenGet('/0/public/Ticker', { pair: pairList.join(',') });

  const pairs = [];
  const resultKeys = Object.keys(result);
  for (const sym of TRADING_PAIR_SYMBOLS) {
    const krakenPair = krakenPairForSymbol(sym);
    if (!krakenPair) continue;

    const key = findTickerKey(krakenPair, resultKeys);
    if (!key) continue;

    const row = mapTickerRow(sym, key, result[key]);
    if (row) pairs.push(row);
  }

  if (!pairs.length) {
    throw new Error('Kraken returned no ticker data');
  }

  priceCache = { pairs, fetchedAt: now, stale: false };
  return {
    pairs,
    stale: false,
    updatedAt: new Date(now).toISOString(),
    provider: 'kraken',
  };
}

export async function fetchTicker(symbol) {
  const sym = normalizeSymbol(symbol);
  const krakenPair = krakenPairForSymbol(sym);
  if (!krakenPair) {
    const err = new Error(`Kraken does not support ${sym}`);
    err.status = 400;
    throw err;
  }

  const result = await fetchAllPairPrices();
  const row = result.pairs.find((p) => p.symbol === sym);
  if (!row) {
    const err = new Error(`Ticker not found for ${sym}`);
    err.status = 404;
    throw err;
  }
  return row;
}

export async function fetchKlines(symbol, interval, { limit = 500 } = {}) {
  const sym = normalizeSymbol(symbol);
  const krakenPair = krakenPairForSymbol(sym);
  const minutes = krakenIntervalMinutes(interval);

  if (!krakenPair || !minutes) {
    const err = new Error(`Kraken does not support ${sym} @ ${interval}`);
    err.status = 400;
    throw err;
  }

  const result = await krakenGet('/0/public/OHLC', {
    pair: krakenPair,
    interval: minutes,
  });

  const key = Object.keys(result).find((k) => k !== 'last') || Object.keys(result)[0];
  const rows = result[key] || [];

  const candles = rows
    .map((row) => ({
      openTime: Number(row[0]) * 1000,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6]) || 0,
      isFinal: true,
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));

  return candles.slice(-limit);
}
