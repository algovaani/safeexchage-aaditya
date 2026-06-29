import axios from 'axios';
import { TRADING_PAIR_SYMBOLS } from '../config/tradingPairs.js';
import { COINGECKO_IDS, COINGECKO_ID_TO_SYMBOL, coinIdForSymbol } from '../config/coingeckoIds.js';

const REST = (process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3').replace(/\/$/, '');
const API_KEY = process.env.COINGECKO_API_KEY?.trim();
const CACHE_TTL_MS = Number(process.env.COINGECKO_PRICE_CACHE_MS) || 12_000;
const CHART_CACHE_TTL_MS = Number(process.env.COINGECKO_CHART_CACHE_MS) || 60_000;

let priceCache = {
  pairs: null,
  fetchedAt: 0,
  stale: false,
};

const chartCache = new Map();

/** Recent price ticks for 1s candles — symbol → [{ time, price }] */
const recentTicks = new Map();

function apiHeaders() {
  const headers = { accept: 'application/json' };
  if (API_KEY) {
    headers['x-cg-demo-api-key'] = API_KEY;
    headers['x-cg-pro-api-key'] = API_KEY;
  }
  return headers;
}

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

export function intervalToMs(interval) {
  const map = {
    '1s': 1000,
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
    '1w': 604_800_000,
  };
  return map[String(interval || '').toLowerCase()] || null;
}

function mapMarketsRow(symbol, coin) {
  return {
    symbol,
    pair: toDisplayPair(symbol),
    price: Number(coin.current_price) || 0,
    change_24h: Number(coin.price_change_percentage_24h) || 0,
    high_24h: Number(coin.high_24h) || 0,
    low_24h: Number(coin.low_24h) || 0,
    volume: Number(coin.total_volume) || 0,
    quoteVolume: Number(coin.total_volume) || 0,
  };
}

async function coingeckoGet(url, config = {}) {
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await axios.get(url, {
        headers: apiHeaders(),
        timeout: 25_000,
        ...config,
      });
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 429 && attempt < maxAttempts) {
        const wait = Number(err.response?.headers?.['retry-after']) * 1000 || 2500 * attempt;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function mapSimplePriceRow(symbol, row) {
  const price = Number(row?.usd);
  if (!Number.isFinite(price) || price <= 0) return null;

  const change = Number(row?.usd_24h_change) || 0;
  const vol = Number(row?.usd_24h_vol) || 0;
  const swing = Math.abs(change) / 100;

  return {
    symbol,
    pair: toDisplayPair(symbol),
    price,
    change_24h: change,
    high_24h: price * (1 + swing / 2),
    low_24h: price * (1 - swing / 2),
    volume: vol,
    quoteVolume: vol,
    updatedAt: row?.last_updated_at
      ? new Date(Number(row.last_updated_at) * 1000).toISOString()
      : null,
  };
}

/** Primary trade-time prices — CoinGecko simple/price (lightweight, global). */
async function fetchSimplePricesFromApi() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const { data } = await coingeckoGet(`${REST}/simple/price`, {
    params: {
      ids,
      vs_currencies: 'usd',
      include_24hr_change: true,
      include_24hr_vol: true,
      include_last_updated_at: true,
    },
  });

  return TRADING_PAIR_SYMBOLS.map((sym) => {
    const id = COINGECKO_IDS[sym];
    return mapSimplePriceRow(sym, data?.[id]);
  }).filter(Boolean);
}

/** Fallback when simple/price fails — richer 24h high/low from markets endpoint. */
async function fetchMarketsFromApi() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const { data } = await coingeckoGet(`${REST}/coins/markets`, {
    params: {
      vs_currency: 'usd',
      ids,
      order: 'market_cap_desc',
      sparkline: false,
      price_change_percentage: '24h',
    },
  });

  const byId = new Map((Array.isArray(data) ? data : []).map((row) => [row.id, row]));
  return TRADING_PAIR_SYMBOLS.map((sym) => {
    const id = COINGECKO_IDS[sym];
    const row = byId.get(id);
    return row ? mapMarketsRow(sym, row) : null;
  }).filter(Boolean);
}

export function recordPriceTick(symbol, price) {
  const sym = normalizeSymbol(symbol);
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return;

  if (!recentTicks.has(sym)) recentTicks.set(sym, []);
  const arr = recentTicks.get(sym);
  arr.push({ time: Date.now(), price: p });
  while (arr.length > 3600) arr.shift();
}

export function bucketRecentPricesToSecondCandles(symbol, maxBars = 600) {
  return bucketTicksToIntervalCandles(symbol, 1000, maxBars);
}

/** Build OHLCV candles from live price ticks (Binance-like intraday bars). */
export function bucketTicksToIntervalCandles(symbol, intervalMs, maxBars = 600) {
  const ticks = recentTicks.get(normalizeSymbol(symbol)) || [];
  if (!ticks.length || !intervalMs) return [];

  const currentBucket = Math.floor(Date.now() / intervalMs) * intervalMs;
  const byBucket = new Map();

  for (const t of ticks) {
    const openTime = Math.floor(t.time / intervalMs) * intervalMs;
    if (!byBucket.has(openTime)) {
      byBucket.set(openTime, {
        openTime,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: 1,
        isFinal: openTime < currentBucket,
      });
    } else {
      const c = byBucket.get(openTime);
      c.high = Math.max(c.high, t.price);
      c.low = Math.min(c.low, t.price);
      c.close = t.price;
      c.volume += 1;
    }
  }

  return [...byBucket.values()].sort((a, b) => a.openTime - b.openTime).slice(-maxBars);
}

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

  recordPriceTick(sym, row.price);
  return { ...row, stale: result.stale, updatedAt: result.updatedAt };
}

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
    let pairs;
    try {
      pairs = await fetchSimplePricesFromApi();
    } catch (simpleErr) {
      console.warn('[coingecko] simple/price failed, falling back to /coins/markets:', simpleErr.message);
      pairs = await fetchMarketsFromApi();
    }

    if (!pairs.length) {
      throw new Error('CoinGecko returned no prices for configured pairs');
    }

    for (const row of pairs) {
      recordPriceTick(row.symbol, row.price);
    }

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

export async function fetchPriceMap(options = {}) {
  const result = await fetchAllPairPrices(options);
  const prices = {};
  for (const row of result.pairs) {
    prices[row.symbol] = row.price;
  }
  return { prices, stale: result.stale, updatedAt: result.updatedAt };
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

function daysForChart(intervalMs, limit, startTime, endTime) {
  if (startTime != null && endTime != null && endTime > startTime) {
    const days = Math.ceil((endTime - startTime) / 86_400_000);
    return Math.min(Math.max(days, 1), 365);
  }
  const rangeMs = intervalMs * Math.max(limit, 50);
  const days = Math.ceil(rangeMs / 86_400_000);
  return Math.min(Math.max(days, 1), 365);
}

async function fetchMarketChart(coinId, days) {
  const cacheKey = `${coinId}:${days}`;
  const cached = chartCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  const { data } = await coingeckoGet(`${REST}/coins/${coinId}/market_chart`, {
    params: { vs_currency: 'usd', days },
  });

  const payload = {
    prices: data?.prices || [],
    volumes: data?.total_volumes || [],
  };
  chartCache.set(cacheKey, { data: payload, fetchedAt: now });
  return payload;
}

function resampleCandles(pricePoints, volumePoints, intervalMs, limit) {
  const buckets = new Map();

  for (const [ts, price] of pricePoints) {
    const p = Number(price);
    if (!Number.isFinite(p)) continue;
    const openTime = Math.floor(ts / intervalMs) * intervalMs;
    let c = buckets.get(openTime);
    if (!c) {
      c = {
        openTime,
        open: p,
        high: p,
        low: p,
        close: p,
        volume: 0,
        isFinal: true,
      };
      buckets.set(openTime, c);
    } else {
      c.high = Math.max(c.high, p);
      c.low = Math.min(c.low, p);
      c.close = p;
    }
  }

  for (const [ts, vol] of volumePoints) {
    const v = Number(vol);
    if (!Number.isFinite(v)) continue;
    const openTime = Math.floor(ts / intervalMs) * intervalMs;
    const c = buckets.get(openTime);
    if (c) c.volume += v;
  }

  return [...buckets.values()].sort((a, b) => a.openTime - b.openTime).slice(-limit);
}

function mergeCandleSeries(base, live) {
  const map = new Map();
  for (const c of base) map.set(c.openTime, c);
  for (const c of live) map.set(c.openTime, c);
  return [...map.values()].sort((a, b) => a.openTime - b.openTime);
}

async function fetchOhlcCandles(coinId, days) {
  const cacheKey = `ohlc:${coinId}:${days}`;
  const cached = chartCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  const { data } = await coingeckoGet(`${REST}/coins/${coinId}/ohlc`, {
    params: { vs_currency: 'usd', days },
  });

  const candles = (Array.isArray(data) ? data : [])
    .map((row) => ({
      openTime: row[0],
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: 0,
      isFinal: true,
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));

  chartCache.set(cacheKey, { data: candles, fetchedAt: now });
  return candles;
}

function ohlcDaysForInterval(interval) {
  const map = { '4h': 30, '1d': 90, '1D': 90, '1w': 365 };
  return map[interval] || null;
}

function resampleOhlcCandles(candles, intervalMs, limit) {
  const buckets = new Map();
  for (const c of candles) {
    const openTime = Math.floor(c.openTime / intervalMs) * intervalMs;
    let row = buckets.get(openTime);
    if (!row) {
      row = { ...c, openTime, volume: c.volume || 0 };
      buckets.set(openTime, row);
    } else {
      row.high = Math.max(row.high, c.high);
      row.low = Math.min(row.low, c.low);
      row.close = c.close;
      row.volume += c.volume || 0;
    }
  }
  return [...buckets.values()].sort((a, b) => a.openTime - b.openTime).slice(-limit);
}

async function fetchHistoricalCandles(sym, coinId, interval, intervalMs, { limit, startTime, endTime }) {
  const ohlcDays = ohlcDaysForInterval(interval);
  if (ohlcDays) {
    let candles = await fetchOhlcCandles(coinId, ohlcDays);
    if (intervalMs !== 14_400_000) {
      candles = resampleOhlcCandles(candles, intervalMs, limit);
    }
    return candles;
  }

  const days = daysForChart(intervalMs, limit, startTime, endTime);
  const chart = await fetchMarketChart(coinId, days);
  return resampleCandles(chart.prices, chart.volumes, intervalMs, limit);
}

export async function fetchKlines(symbol, interval, { startTime, endTime, limit = 500 } = {}) {
  const sym = normalizeSymbol(symbol);
  const coinId = coinIdForSymbol(sym);
  if (!coinId) {
    const err = new Error(`Unsupported trading pair: ${symbol}`);
    err.status = 400;
    throw err;
  }

  if (interval === '1s') {
    if (!recentTicks.get(sym)?.length) {
      await fetchTicker(sym, { force: true });
    }
    return bucketRecentPricesToSecondCandles(sym, Math.min(limit, 600));
  }

  const intervalMs = intervalToMs(interval);
  if (!intervalMs) {
    const err = new Error(`Unsupported chart interval: ${interval}`);
    err.status = 400;
    throw err;
  }

  if (!recentTicks.get(sym)?.length) {
    await fetchTicker(sym).catch(() => {});
  }

  let candles = await fetchHistoricalCandles(sym, coinId, interval, intervalMs, {
    limit,
    startTime,
    endTime,
  });

  const live = bucketTicksToIntervalCandles(sym, intervalMs, Math.min(limit, 180));
  candles = mergeCandleSeries(candles, live);

  if (startTime != null) candles = candles.filter((c) => c.openTime >= startTime);
  if (endTime != null) candles = candles.filter((c) => c.openTime <= endTime);

  return candles.slice(-limit);
}

/** Build pseudo-trades from recent 1s candles (legacy shape for 1s charts). */
export async function fetchAggTrades(symbol, { limit = 1000 } = {}) {
  const sym = normalizeSymbol(symbol);
  if (!recentTicks.get(sym)?.length) {
    await fetchTicker(sym, { force: true });
  }
  const candles = bucketRecentPricesToSecondCandles(sym, 600);
  return candles
    .map((c) => ({
      price: c.close,
      qty: Math.max(c.volume, 0.001),
      time: c.openTime + 500,
    }))
    .slice(-limit);
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
  return [...bySec.values()].sort((a, b) => a.openTime - b.openTime).slice(-maxBars);
}

/** @deprecated CoinGecko uses REST polling — kept for compatibility */
export function parseKlineEvent() {
  return null;
}

export function syntheticOrderBook(mid, levels = 14) {
  if (!mid || !Number.isFinite(mid)) {
    return { bids: [], asks: [], mid: null };
  }
  const step = mid * 0.00015;
  const asks = [];
  const bids = [];
  for (let i = 1; i <= levels; i += 1) {
    const qty = +(Math.random() * 1.5 + 0.05).toFixed(4);
    asks.push({ price: +(mid + step * i).toFixed(8), qty });
    bids.push({ price: +(mid - step * i).toFixed(8), qty });
  }
  return { asks, bids, mid };
}

export function getPriceCacheTtlMs() {
  return CACHE_TTL_MS;
}

export { COINGECKO_ID_TO_SYMBOL };
