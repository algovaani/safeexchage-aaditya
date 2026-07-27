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
import { fetchDexPairPrices, getCachedDexPrice } from './dexscreenerService.js';
import { getActivePulsePrice, getPulseDepthOverlay } from './pricePulseService.js';
import {
  applyTickerStatsOverride,
  applyTickerStatsOverridesToPairs,
  getTickerStatsOverride,
} from './tickerStatsOverrideService.js';
import {
  normalizeSymbol,
  toDisplayPair,
  intervalToMs,
  recordPriceTick,
  clearRecentTicks,
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

let priceCache = { pairs: null, fetchedAt: 0, stale: false, refreshing: false };

export function invalidatePriceCache() {
  priceCache = { pairs: null, fetchedAt: 0, stale: false, refreshing: false };
}

function isManualPricePair(symbol) {
  const pair = getPairSync(symbol);
  return Boolean(pair && pair.priceAuto === false && Number(pair.manualPrice) > 0);
}

async function pairsWithManualAndStats(rawPairs) {
  await ensureTradingPairCache();
  const withStats = await applyTickerStatsOverridesToPairs(rawPairs);
  return applyActivePulses(applyManualPairPrices(withStats));
}

/** Active admin pulse always wins last price (memory-only, site-wide). */
function applyActivePulseToRow(row) {
  if (!row?.symbol) return row;
  const pulsed = getActivePulsePrice(row.symbol);
  if (pulsed == null) return row;
  return {
    ...row,
    price: pulsed,
    lastPrice: pulsed,
    pulsed: true,
  };
}

function applyActivePulses(pairs) {
  return (Array.isArray(pairs) ? pairs : []).map(applyActivePulseToRow);
}

// Re-export provider-agnostic helpers so the public API surface is unchanged.
export {
  normalizeSymbol,
  toDisplayPair,
  intervalToMs,
  recordPriceTick,
  clearRecentTicks,
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

/** Admin coin edit: Auto off → show only manual last price (+ optional 24h fields). */
export function applyManualPairPrice(row) {
  if (!row?.symbol) return row;
  const pair = getPairSync(row.symbol);
  if (!pair || pair.priceAuto !== false) {
    return { ...row, price_auto: true, price_manual: false };
  }
  const px = Number(pair.manualPrice);
  if (!(px > 0)) return { ...row, price_auto: false, price_manual: false };

  const next = {
    ...row,
    price: px,
    lastPrice: px,
    price_auto: false,
    price_manual: true,
    stats_override: true,
    provider: 'manual',
    open_24h: px,
    change_24h: 0,
    change_24h_abs: 0,
    high_24h: px,
    low_24h: px,
    volume: 0,
    quoteVolume: 0,
  };

  if (pair.manualChange24h != null && Number.isFinite(Number(pair.manualChange24h))) {
    const pct = Number(pair.manualChange24h);
    next.change_24h = pct;
    if (px > 0) {
      const open = px / (1 + pct / 100);
      next.open_24h = open;
      next.change_24h_abs = px - open;
    }
  }

  const high =
    pair.manualHigh24h != null && Number.isFinite(Number(pair.manualHigh24h))
      ? Number(pair.manualHigh24h)
      : null;
  const low =
    pair.manualLow24h != null && Number.isFinite(Number(pair.manualLow24h))
      ? Number(pair.manualLow24h)
      : null;
  if (high != null) next.high_24h = high;
  if (low != null) next.low_24h = low;

  // Volume = |high − low| when both set; else use explicit manual volume
  let vol = null;
  if (high != null && low != null) {
    vol = Math.abs(high - low);
  } else if (pair.manualVolume != null && Number.isFinite(Number(pair.manualVolume))) {
    vol = Number(pair.manualVolume);
  }
  if (vol != null && vol >= 0) {
    next.volume = vol;
    // Frontend ticker / markets show quoteVolume as "24h Volume"
    next.quoteVolume = vol;
  }

  return next;
}

function applyManualPairPrices(pairs) {
  return (Array.isArray(pairs) ? pairs : []).map(applyManualPairPrice);
}

export async function fetchAllPairPrices({ force = false } = {}) {
  const now = Date.now();
  if (!force && priceCache.pairs && now - priceCache.fetchedAt < CACHE_TTL_MS) {
    const pairs = await pairsWithManualAndStats(priceCache.pairs);
    return {
      pairs,
      stale: priceCache.stale,
      updatedAt: new Date(priceCache.fetchedAt).toISOString(),
      provider: 'binance',
    };
  }

  // Stale-while-revalidate: return last good prices immediately, refresh in background
  if (!force && priceCache.pairs?.length) {
    if (!priceCache.refreshing) {
      priceCache.refreshing = true;
      Promise.resolve()
        .then(() => fetchAllPairPrices({ force: true }))
        .catch((err) => console.warn('[prices] bg refresh:', err.message))
        .finally(() => {
          priceCache.refreshing = false;
        });
    }
    const pairs = await pairsWithManualAndStats(priceCache.pairs);
    return {
      pairs,
      stale: true,
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
  const dexPairs = activePairs.filter(
    (p) => p.priceSource === 'dexscreener' && p.dexPairAddress && p.dexChainId
  );
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

    // CoinGecko is optional — never block Binance/Dex prices (429 storms hang the API).
    if (needCg.length) {
      try {
        const cgResult = await Promise.race([
          coingeckoMarket.fetchAllPairPrices({ force: false }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('coingecko timeout')), 2_500)),
        ]);
        for (const row of cgResult.pairs || []) {
          if (needCg.includes(row.symbol)) {
            bySymbol.set(row.symbol, { ...row, provider: 'coingecko' });
            recordPriceTick(row.symbol, row.price);
          }
        }
      } catch (err) {
        console.warn('[prices] CoinGecko skip:', err.message);
      }
    }

    if (dexPairs.length) {
      try {
        const dexRows = await fetchDexPairPrices(dexPairs);
        for (const row of dexRows) {
          bySymbol.set(row.symbol, row);
          recordPriceTick(row.symbol, row.price);
        }
        // Keep last-known Dex prices if this refresh was partially rate-limited
        for (const def of dexPairs) {
          if (bySymbol.has(def.symbol)) continue;
          const cached = getCachedDexPrice(def.symbol);
          if (cached?.price > 0) {
            bySymbol.set(def.symbol, { ...cached, stale: true });
          }
        }
      } catch (err) {
        console.warn('[prices] DexScreener skip:', err.message);
        for (const def of dexPairs) {
          const cached = getCachedDexPrice(def.symbol);
          if (cached?.price > 0) bySymbol.set(def.symbol, { ...cached, stale: true });
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
      .map((p) => {
        const live = bySymbol.get(p.symbol);
        if (live) return live;
        // Manual-only coins (no live feed) still need a ticker row
        if (p.priceAuto === false && Number(p.manualPrice) > 0) {
          const px = Number(p.manualPrice);
          return {
            symbol: p.symbol,
            pair: p.displayPair || toDisplayPair(p.symbol),
            price: px,
            open_24h: px,
            change_24h: 0,
            change_24h_abs: 0,
            high_24h: px,
            low_24h: px,
            volume: 0,
            quoteVolume: 0,
            provider: 'manual',
          };
        }
        return null;
      })
      .filter(Boolean);

    if (!pairs.length) {
      throw new Error('No market prices available');
    }

    priceCache = { pairs, fetchedAt: now, stale: false, refreshing: false };
    const pairsWithOverrides = await pairsWithManualAndStats(pairs);
    return {
      pairs: pairsWithOverrides,
      stale: false,
      updatedAt: new Date(now).toISOString(),
      provider: 'mixed',
    };
  } catch (err) {
    if (priceCache.pairs) {
      const pairsWithOverrides = await pairsWithManualAndStats(priceCache.pairs);
      return {
        pairs: pairsWithOverrides,
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

  // Prefer cache / fast path so refresh storms don't hang on CoinGecko
  if (priceCache.pairs?.length && !opts.force) {
    const cached = priceCache.pairs.find((p) => p.symbol === sym);
    const age = Date.now() - (priceCache.fetchedAt || 0);
    if (cached && age < Math.max(CACHE_TTL_MS * 3, 12_000)) {
      let row = applyManualPairPrice(cached);
      const override = isManualPricePair(sym) ? null : await getTickerStatsOverride(sym);
      const withStats = applyTickerStatsOverride(
        {
          ...row,
          stale: age > CACHE_TTL_MS,
          updatedAt: new Date(priceCache.fetchedAt).toISOString(),
        },
        override
      );
      // Pulse always wins last price while active (even if Auto is off)
      return applyActivePulseToRow(applyManualPairPrice(withStats));
    }
  }

  const result = await fetchAllPairPrices(opts);
  const row =
    result.pairs.find((p) => p.symbol === sym) ||
    (() => {
      const cached = getCachedDexPrice(sym);
      return cached?.price > 0 ? cached : null;
    })();
  if (!row) {
    const err = new Error(`Ticker not found for ${sym}`);
    err.status = 404;
    throw err;
  }

  let base = applyManualPairPrice(row);
  const override = isManualPricePair(sym) ? null : await getTickerStatsOverride(sym);
  recordPriceTick(sym, Number(base.price) || 0);
  return applyActivePulseToRow(
    applyManualPairPrice(
      applyTickerStatsOverride(
        {
          ...base,
          stale: result.stale,
          updatedAt: result.updatedAt,
        },
        override
      )
    )
  );
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
    priceChange: row.change_24h_abs ?? null,
    priceChangePercent: row.change_24h,
    highPrice: row.high_24h,
    lowPrice: row.low_24h,
    volume: row.volume,
    quoteVolume: row.quoteVolume,
    stats_override: Boolean(row.stats_override),
    price_auto: row.price_auto !== false,
    price_manual: Boolean(row.price_manual),
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

  if (pair?.priceSource === 'dexscreener') {
    // Prefer live tick buckets; seed a flat candle from current Dex price if cold.
    const fromTicks = bucketTicksToIntervalCandles(sym, intervalToMs(interval), limit);
    if (fromTicks.length) return fromTicks;
    try {
      const [live] = await fetchDexPairPrices([pair]);
      if (live?.price > 0) {
        recordPriceTick(sym, live.price);
        const openTime = Math.floor(Date.now() / intervalToMs(interval)) * intervalToMs(interval);
        return [
          {
            openTime,
            open: live.price,
            high: live.price,
            low: live.price,
            close: live.price,
            volume: live.volume || 0,
            isFinal: false,
          },
        ];
      }
    } catch {
      /* empty */
    }
    return [];
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

  if (pair?.priceSource === 'coingecko' || pair?.priceSource === 'dexscreener') {
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

  const pulseDepth = getPulseDepthOverlay(sym);
  if (pulseDepth?.bids?.length || pulseDepth?.asks?.length) {
    return {
      bids: (pulseDepth.bids || []).slice(0, limit),
      asks: (pulseDepth.asks || []).slice(0, limit),
      mid: pulseDepth.mid,
      pulse: true,
    };
  }

  const pair = getPairSync(sym);
  if (pair?.priceSource === 'commodity_inr' || isCommoditySymbol(sym)) {
    try {
      return await fetchCommodityDepth(sym, { limit });
    } catch {
      return null;
    }
  }

  if (pair?.priceSource === 'coingecko' || pair?.priceSource === 'dexscreener') {
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
