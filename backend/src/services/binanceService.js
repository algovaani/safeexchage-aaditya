import axios from 'axios';
import { TRADING_PAIR_SYMBOLS } from '../config/tradingPairs.js';

const REST = process.env.BINANCE_REST_URL || 'https://api.binance.com';
const REST_V3 = `${REST}/api/v3`;
const CACHE_TTL_MS = 500;

let priceCache = {
  pairs: null,
  fetchedAt: 0,
  stale: false,
};

export function normalizeSymbol(input) {
  const raw = String(input).toUpperCase().trim().replace(/\//g, '');
  if (TRADING_PAIR_SYMBOLS.includes(raw)) return raw;
  const withUsdt = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  return withUsdt;
}

export function toDisplayPair(symbol) {
  const upper = String(symbol).toUpperCase();
  if (upper.endsWith('USDT')) return `${upper.slice(0, -4)}/USDT`;
  return upper;
}

function mapTickerRow(data) {
  return {
    symbol: data.symbol,
    pair: toDisplayPair(data.symbol),
    price: parseFloat(data.lastPrice),
    change_24h: parseFloat(data.priceChangePercent),
    high_24h: parseFloat(data.highPrice),
    low_24h: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume),
    quoteVolume: parseFloat(data.quoteVolume),
  };
}

async function fetchTickersFromApi(symbols) {
  const { data } = await axios.get(`${REST_V3}/ticker/24hr`, {
    params: { symbols: JSON.stringify(symbols) },
    timeout: 15_000,
  });
  return Array.isArray(data) ? data : [data];
}

/**
 * GET /ticker/24hr for one symbol with in-memory cache (shared with fetchAllPairPrices).
 */
export async function fetchTicker(symbol, { force = false } = {}) {
  const sym = normalizeSymbol(symbol);
  if (!TRADING_PAIR_SYMBOLS.includes(sym)) {
    const err = new Error(`Unsupported trading pair: ${symbol}`);
    err.status = 400;
    throw err;
  }

  const result = await fetchAllPairPrices({ force });
  const row = result.pairs.find((p) => p.symbol === sym);
  if (!row) {
    const err = new Error(`Ticker not found for ${sym}`);
    err.status = 404;
    throw err;
  }

  return { ...row, stale: result.stale, updatedAt: result.updatedAt };
}

/**
 * Fetch all configured USDT pairs in one Binance request; cache 500ms.
 */
export async function fetchAllPairPrices({ force = false } = {}) {
  const now = Date.now();

  if (!force && priceCache.pairs && now - priceCache.fetchedAt < CACHE_TTL_MS) {
    return {
      pairs: priceCache.pairs,
      stale: priceCache.stale,
      updatedAt: new Date(priceCache.fetchedAt).toISOString(),
    };
  }

  try {
    const raw = await fetchTickersFromApi(TRADING_PAIR_SYMBOLS);
    const bySymbol = new Map(raw.map((row) => [row.symbol, mapTickerRow(row)]));
    const pairs = TRADING_PAIR_SYMBOLS.map((sym) => bySymbol.get(sym)).filter(Boolean);

    priceCache = { pairs, fetchedAt: now, stale: false };

    return {
      pairs,
      stale: false,
      updatedAt: new Date(now).toISOString(),
    };
  } catch (err) {
    if (priceCache.pairs) {
      return {
        pairs: priceCache.pairs,
        stale: true,
        updatedAt: new Date(priceCache.fetchedAt).toISOString(),
        error: err.message,
      };
    }
    throw err;
  }
}

/**
 * Symbol → last price map e.g. { BTCUSDT: 67420.5, ETHUSDT: 3521.2 }
 */
export async function fetchPriceMap(options = {}) {
  const result = await fetchAllPairPrices(options);
  const prices = {};
  for (const row of result.pairs) {
    prices[row.symbol] = row.price;
  }
  return { prices, stale: result.stale, updatedAt: result.updatedAt };
}

/** @deprecated Use fetchTicker — kept for existing callers */
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

/**
 * Recent aggregate trades (used to build second-level candles; Binance has no 1s klines on spot).
 */
export async function fetchAggTrades(symbol, { limit = 1000 } = {}) {
  const { data } = await axios.get(`${REST_V3}/aggTrades`, {
    params: { symbol: normalizeSymbol(symbol), limit },
    timeout: 15_000,
  });
  return data.map((t) => ({
    price: parseFloat(t.p),
    qty: parseFloat(t.q),
    time: t.T,
  }));
}

export function bucketTradesToSecondCandles(trades, maxBars = 600) {
  const bySec = new Map();
  for (const t of trades) {
    const openTime = Math.floor(t.time / 1000) * 1000;
    if (!bySec.has(openTime)) {
      bySec.set(openTime, {
        openTime,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: t.qty,
        isFinal: true,
      });
    } else {
      const c = bySec.get(openTime);
      c.high = Math.max(c.high, t.price);
      c.low = Math.min(c.low, t.price);
      c.close = t.price;
      c.volume += t.qty;
    }
  }
  const arr = [...bySec.values()].sort((a, b) => a.openTime - b.openTime);
  return arr.slice(-maxBars);
}

export async function fetchKlines(symbol, interval, { startTime, endTime, limit = 500 } = {}) {
  const params = { symbol: normalizeSymbol(symbol), interval, limit };
  if (startTime != null) params.startTime = startTime;
  if (endTime != null) params.endTime = endTime;

  const { data } = await axios.get(`${REST_V3}/klines`, { params, timeout: 15_000 });

  return data.map((row) => ({
    openTime: row[0],
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
    isFinal: true,
  }));
}

/**
 * Parse Binance combined stream kline event payload.
 */
export function parseKlineEvent(data) {
  const k = data.k;
  if (!k) return null;
  return {
    openTime: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    isFinal: k.x === true,
  };
}
