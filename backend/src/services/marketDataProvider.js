/**
 * Unified market data — Binance public REST only.
 *
 * Prices, 24h stats, candles, trades and order-book depth all come straight
 * from Binance so values match the Binance app/website exactly. Pure helper
 * utilities (symbol normalisation, tick bucketing) are reused from the shared
 * helpers module — they are provider-agnostic math, not a price source.
 */
import axios from 'axios';
import {
  ensureTradingPairCache,
  getActivePairsSync,
  getPairSync,
  getTradingPairSymbolsSync,
} from './tradingPairService.js';
import * as coingeckoMarket from './coingeckoService.js';
import { fetchCommodityPrices, fetchCommodityTicker, fetchCommodityKlines, fetchCommodityDepth, isCommoditySymbol } from './commodityService.js';
import { getActivePulsePrice } from './pricePulseService.js';
import {
  normalizeSymbol,
  toDisplayPair,
  intervalToMs,
  recordPriceTick,
  bucketRecentPricesToSecondCandles,
  bucketTicksToIntervalCandles,
  bucketTradesToSecondCandles,
  parseKlineEvent,
  syntheticOrderBook,
} from './coingeckoService.js';

/**
 * Binance REST hosts, tried in order. `api.binance.com` is geo-blocked in some
 * regions (HTTP 451); `data-api.binance.vision` is the public market-data mirror
 * that serves the same endpoints globally without restriction. We start from the
 * configured host and always keep the vision mirror as a fallback.
 */
const CONFIGURED_HOST = (
  process.env.BINANCE_API_URL ||
  process.env.BINANCE_REST_URL ||
  ''
).replace(/\/$/, '');

const REST_HOSTS = [
  ...(CONFIGURED_HOST ? [CONFIGURED_HOST] : []),
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
].filter((h, i, arr) => h && arr.indexOf(h) === i);

// Remember the host that last worked so we don't retry blocked ones every call.
let preferredHostIndex = 0;
const CACHE_TTL_MS = Number(process.env.BINANCE_PRICE_CACHE_MS) || 4000;

const BINANCE_INTERVALS = new Set([
  '1s', '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w', '1M',
]);

let priceCache = { pairs: null, fetchedAt: 0, stale: false };

// Re-export provider-agnostic helpers so the public API surface is unchanged.
export {
  normalizeSymbol,
  toDisplayPair,
  intervalToMs,
  recordPriceTick,
  bucketRecentPricesToSecondCandles,
  bucketTicksToIntervalCandles,
  bucketTradesToSecondCandles,
  parseKlineEvent,
  syntheticOrderBook,
};

export function getPriceCacheTtlMs() {
  return CACHE_TTL_MS;
}

export function getActiveProvider() {
  return 'binance';
}

async function binanceGet(path, params = {}) {
  const order = [
    ...REST_HOSTS.slice(preferredHostIndex),
    ...REST_HOSTS.slice(0, preferredHostIndex),
  ];

  let lastErr;
  for (let i = 0; i < order.length; i += 1) {
    const host = order[i];
    try {
      const { data } = await axios.get(`${host}${path}`, {
        params,
        timeout: 15_000,
        headers: { accept: 'application/json' },
      });
      preferredHostIndex = REST_HOSTS.indexOf(host);
      return data;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      // Geo/permission blocks (451/403/401) or reachability issues → try next host.
      const retryable =
        status === 451 || status === 403 || status === 401 || status === 429 || status == null;
      if (i === 0 && status === 451) {
        console.warn(`[binance] ${host} blocked (451) — falling back to mirror`);
      }
      if (!retryable && i === order.length - 1) throw err;
    }
  }
  throw lastErr;
}

function mapTickerRow(sym, t) {
  const price = Number(t?.lastPrice);
  if (!Number.isFinite(price) || price <= 0) return null;

  const open = Number(t.openPrice);
  const change = Number(t.priceChange);

  return {
    symbol: sym,
    pair: toDisplayPair(sym),
    price,
    open_24h: Number.isFinite(open) && open > 0 ? open : null,
    change_24h: Number(t.priceChangePercent) || 0,
    change_24h_abs: Number.isFinite(change) ? change : null,
    high_24h: Number(t.highPrice) || price,
    low_24h: Number(t.lowPrice) || price,
    volume: Number(t.volume) || 0,
    quoteVolume: Number(t.quoteVolume) || 0,
    provider: 'binance',
  };
}

export async function fetchAllPairPrices({ force = false } = {}) {
  const now = Date.now();
  if (!force && priceCache.pairs && now - priceCache.fetchedAt < CACHE_TTL_MS) {
    return {
      pairs: priceCache.pairs,
      stale: priceCache.stale,
      updatedAt: new Date(priceCache.fetchedAt).toISOString(),
      provider: 'binance',
    };
  }

  await ensureTradingPairCache();
  const activePairs = getActivePairsSync();
  const binanceSyms = activePairs
    .filter((p) => p.priceSource === 'binance' || (!p.priceSource && p.category !== 'commodity'))
    .map((p) => p.symbol);
  const cgOnlySyms = activePairs
    .filter((p) => p.priceSource === 'coingecko')
    .map((p) => p.symbol);
  const commoditySyms = activePairs
    .filter((p) => p.priceSource === 'commodity_inr')
    .map((p) => p.symbol);

  const bySymbol = new Map();

  try {
    if (binanceSyms.length) {
      const symbolsParam = JSON.stringify(binanceSyms);
      const data = await binanceGet('/api/v3/ticker/24hr', { symbols: symbolsParam });
      const bySym = new Map((Array.isArray(data) ? data : []).map((t) => [t.symbol, t]));
      for (const sym of binanceSyms) {
        const row = mapTickerRow(sym, bySym.get(sym));
        if (row) {
          bySymbol.set(sym, row);
          recordPriceTick(sym, row.price);
        }
      }
    }

    const needCg = [
      ...cgOnlySyms,
      ...binanceSyms.filter((sym) => !bySymbol.has(sym) && getPairSync(sym)?.coingeckoId),
    ];

    if (needCg.length) {
      const cgResult = await coingeckoMarket.fetchAllPairPrices({ force: true });
      for (const row of cgResult.pairs || []) {
        if (needCg.includes(row.symbol)) {
          bySymbol.set(row.symbol, { ...row, provider: 'coingecko' });
          recordPriceTick(row.symbol, row.price);
        }
      }
    }

    if (commoditySyms.length) {
      const commodityResult = await fetchCommodityPrices({ force });
      for (const row of commodityResult.pairs || []) {
        if (commoditySyms.includes(row.symbol)) {
          bySymbol.set(row.symbol, row);
        }
      }
    }

    const pairs = activePairs
      .map((p) => bySymbol.get(p.symbol))
      .filter(Boolean);

    if (!pairs.length) {
      throw new Error('No market prices available');
    }

    priceCache = { pairs, fetchedAt: now, stale: false };
    return {
      pairs,
      stale: false,
      updatedAt: new Date(now).toISOString(),
      provider: 'mixed',
    };
  } catch (err) {
    if (priceCache.pairs) {
      return {
        pairs: priceCache.pairs,
        stale: true,
        updatedAt: new Date(priceCache.fetchedAt).toISOString(),
        provider: 'binance',
        error: err.message,
      };
    }
    throw err;
  }
}

export async function fetchTicker(symbol, opts = {}) {
  const sym = normalizeSymbol(symbol);
  await ensureTradingPairCache();
  if (!getTradingPairSymbolsSync().includes(sym)) {
    const err = new Error(`Unsupported trading pair: ${symbol}`);
    err.status = 400;
    throw err;
  }

  const result = await fetchAllPairPrices(opts);
  const row = result.pairs.find((p) => p.symbol === sym);
  if (!row) {
    const err = new Error(`Ticker not found for ${sym}`);
    err.status = 404;
    throw err;
  }

  const pulsed = getActivePulsePrice(sym);
  const price = pulsed != null ? pulsed : row.price;
  recordPriceTick(sym, price);
  return {
    ...row,
    price,
    lastPrice: price,
    pulsed: pulsed != null,
    stale: result.stale,
    updatedAt: result.updatedAt,
  };
}

export async function fetchPriceMap(opts = {}) {
  const result = await fetchAllPairPrices(opts);
  const prices = {};
  for (const row of result.pairs) {
    prices[row.symbol] = row.price;
  }
  return { prices, stale: result.stale, updatedAt: result.updatedAt, provider: 'binance' };
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

export async function fetchKlines(symbol, interval, { startTime, endTime, limit = 500 } = {}) {
  const sym = normalizeSymbol(symbol);
  await ensureTradingPairCache();
  if (!getTradingPairSymbolsSync().includes(sym)) {
    const err = new Error(`Unsupported trading pair: ${symbol}`);
    err.status = 400;
    throw err;
  }

  const pair = getPairSync(sym);
  if (pair?.priceSource === 'commodity_inr' || isCommoditySymbol(sym)) {
    return fetchCommodityKlines(sym, interval, { startTime, endTime, limit });
  }

  if (pair?.priceSource === 'coingecko') {
    return coingeckoMarket.fetchKlines(sym, interval, { startTime, endTime, limit });
  }

  if (!BINANCE_INTERVALS.has(interval)) {
    const err = new Error(`Unsupported chart interval: ${interval}`);
    err.status = 400;
    throw err;
  }

  try {
    const params = { symbol: sym, interval, limit: Math.min(Math.max(limit, 1), 1000) };
    if (startTime != null) params.startTime = startTime;
    if (endTime != null) params.endTime = endTime;

    const data = await binanceGet('/api/v3/klines', params);
    const now = Date.now();

    const candles = (Array.isArray(data) ? data : [])
      .map((row) => ({
        openTime: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]) || 0,
        isFinal: Number(row[6]) < now,
      }))
      .filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));

    const last = candles[candles.length - 1];
    if (last) recordPriceTick(sym, last.close);

    return candles;
  } catch (err) {
    if (pair?.coingeckoId) {
      return coingeckoMarket.fetchKlines(sym, interval, { startTime, endTime, limit });
    }
    throw err;
  }
}

export async function fetchAggTrades(symbol, { limit = 1000 } = {}) {
  const sym = normalizeSymbol(symbol);
  await ensureTradingPairCache();
  const pair = getPairSync(sym);

  if (pair?.priceSource === 'coingecko') {
    return coingeckoMarket.fetchAggTrades(sym, { limit });
  }

  try {
    const data = await binanceGet('/api/v3/aggTrades', {
      symbol: sym,
      limit: Math.min(Math.max(limit, 1), 1000),
    });

    return (Array.isArray(data) ? data : [])
      .map((t) => ({
        price: Number(t.p),
        qty: Number(t.q),
        time: Number(t.T),
        isBuyerMaker: Boolean(t.m),
      }))
      .filter((t) => Number.isFinite(t.price) && Number.isFinite(t.qty));
  } catch {
    return coingeckoMarket.fetchAggTrades(sym, { limit });
  }
}

/** Real Binance order-book depth — tries every mirror until data is returned. */
const DEPTH_HOSTS = [
  ...(CONFIGURED_HOST ? [CONFIGURED_HOST] : []),
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
].filter((h, i, arr) => h && arr.indexOf(h) === i);

function mapDepthRows(data) {
  const map = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map(([price, qty]) => ({ price: Number(price), qty: Number(qty) }))
      .filter((r) => Number.isFinite(r.price) && Number.isFinite(r.qty) && r.qty > 0);

  const bids = map(data?.bids);
  const asks = map(data?.asks);
  const mid =
    bids[0] && asks[0]
      ? (bids[0].price + asks[0].price) / 2
      : bids[0]?.price || asks[0]?.price || null;
  return { bids, asks, mid };
}

async function binanceGetDepth(path, params = {}) {
  let lastErr;
  for (const host of DEPTH_HOSTS) {
    try {
      const { data } = await axios.get(`${host}${path}`, {
        params,
        timeout: 12_000,
        headers: { accept: 'application/json' },
      });
      const mapped = mapDepthRows(data);
      if (mapped.bids.length || mapped.asks.length) {
        return { ...mapped, source: host };
      }
      lastErr = new Error(`${host} returned empty depth`);
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 451 || status === 403) {
        console.warn(`[binance:depth] ${host} blocked (${status}) — trying next host`);
      }
    }
  }
  throw lastErr || new Error('All Binance depth hosts failed');
}

export async function fetchDepth(symbol, { limit = 20 } = {}) {
  const sym = normalizeSymbol(symbol);
  await ensureTradingPairCache();
  if (!getTradingPairSymbolsSync().includes(sym)) {
    const err = new Error(`Unsupported trading pair: ${symbol}`);
    err.status = 400;
    throw err;
  }

  const pair = getPairSync(sym);
  if (pair?.priceSource === 'commodity_inr' || isCommoditySymbol(sym)) {
    try {
      return await fetchCommodityDepth(sym, { limit });
    } catch {
      return null;
    }
  }

  if (pair?.priceSource === 'coingecko') {
    try {
      const ticker = await fetchTicker(sym);
      return syntheticOrderBook(ticker.price, limit);
    } catch {
      return null;
    }
  }

  try {
    const result = await binanceGetDepth('/api/v3/depth', { symbol: sym, limit });
    const { source, ...depth } = result;
    return depth;
  } catch (err) {
    console.error(`[binance:depth] ${sym}:`, err.message);
    try {
      const ticker = await fetchTicker(sym);
      return syntheticOrderBook(ticker.price, limit);
    } catch {
      return null;
    }
  }
}
