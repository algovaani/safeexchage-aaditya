import axios from 'axios';
import { COMMODITY_PAIRS, TROY_OZ_GRAMS } from '../config/commodityPairs.js';
import { getPairSync } from './tradingPairService.js';
import { bucketTicksToIntervalCandles, recordPriceTick, syntheticOrderBook } from './coingeckoService.js';

const REST = (process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3').replace(/\/$/, '');
const API_KEY = process.env.COINGECKO_API_KEY?.trim();
const CACHE_MS = Number(process.env.COMMODITY_PRICE_CACHE_MS) || 60_000;

let cache = { rows: [], fetchedAt: 0 };

function cgHeaders() {
  const headers = { accept: 'application/json' };
  if (API_KEY) {
    headers['x-cg-demo-api-key'] = API_KEY;
    headers['x-cg-pro-api-key'] = API_KEY;
  }
  return headers;
}

function commodityMeta(symbol) {
  return COMMODITY_PAIRS.find((p) => p.symbol === symbol) || getPairSync(symbol);
}

function ozInrToGramInr(ozInr) {
  return ozInr / TROY_OZ_GRAMS;
}

function mapCommodityRow(meta, cg) {
  const ozInr = Number(cg?.inr);
  if (!Number.isFinite(ozInr) || ozInr <= 0) return null;

  const price = ozInrToGramInr(ozInr);
  const change = Number(cg?.inr_24h_change ?? 0);

  return {
    symbol: meta.symbol,
    pair: meta.displayPair || `${meta.baseAsset}/INR`,
    price,
    price_inr: price,
    quote_asset: 'INR',
    unit: meta.unit || 'g',
    open_24h: null,
    change_24h: Number.isFinite(change) ? change : 0,
    change_24h_abs: null,
    high_24h: price,
    low_24h: price,
    volume: 0,
    quoteVolume: 0,
    provider: 'commodity_inr',
    category: 'commodity',
    name: meta.name || meta.baseAsset,
  };
}

export async function fetchCommodityPrices({ force = false } = {}) {
  if (!COMMODITY_PAIRS.length) {
    cache = { rows: [], fetchedAt: Date.now() };
    return { pairs: [], stale: false, updatedAt: new Date().toISOString() };
  }

  const now = Date.now();
  if (!force && cache.rows.length && now - cache.fetchedAt < CACHE_MS) {
    return { pairs: cache.rows, stale: false, updatedAt: new Date(cache.fetchedAt).toISOString() };
  }

  const ids = [...new Set(
    COMMODITY_PAIRS.flatMap((p) => [p.coingeckoId, ...(p.fallbackCoingeckoIds || [])]).filter(Boolean)
  )].join(',');
  const { data } = await axios.get(`${REST}/simple/price`, {
    params: {
      ids,
      vs_currencies: 'inr',
      include_24hr_change: true,
    },
    headers: cgHeaders(),
    timeout: 15_000,
  });

  const rows = [];
  for (const meta of COMMODITY_PAIRS) {
    const cg =
      data?.[meta.coingeckoId] ||
      (meta.fallbackCoingeckoIds || []).map((id) => data?.[id]).find(Boolean);
    const row = mapCommodityRow(meta, cg);
    if (row) {
      rows.push(row);
      recordPriceTick(meta.symbol, row.price);
    }
  }

  if (!rows.length) {
    if (cache.rows.length) {
      return { pairs: cache.rows, stale: true, updatedAt: new Date(cache.fetchedAt).toISOString() };
    }
    throw new Error('Commodity prices unavailable');
  }

  cache = { rows, fetchedAt: now };
  return { pairs: rows, stale: false, updatedAt: new Date(now).toISOString() };
}

export async function fetchCommodityTicker(symbol) {
  const meta = commodityMeta(symbol);
  if (!meta) {
    const err = new Error(`Unsupported commodity: ${symbol}`);
    err.status = 400;
    throw err;
  }
  const result = await fetchCommodityPrices();
  const row = result.pairs.find((p) => p.symbol === meta.symbol);
  if (!row) {
    const err = new Error(`Commodity ticker not found: ${symbol}`);
    err.status = 404;
    throw err;
  }
  return row;
}

export async function fetchCommodityKlines(symbol, interval, { limit = 500 } = {}) {
  const meta = commodityMeta(symbol);
  if (!meta?.coingeckoId) return [];

  const days = interval === '1d' ? 90 : interval === '4h' || interval === '1h' ? 30 : 7;
  const { data } = await axios.get(`${REST}/coins/${meta.coingeckoId}/market_chart`, {
    params: { vs_currency: 'inr', days },
    headers: cgHeaders(),
    timeout: 20_000,
  });

  const prices = (data?.prices || [])
    .map(([time, ozInr]) => ({
      time: Math.floor(time / 1000),
      price: ozInrToGramInr(Number(ozInr)),
    }))
    .filter((t) => Number.isFinite(t.price) && t.price > 0);

  if (!prices.length) return [];

  if (interval === '1s' || interval === '1m') {
    return prices.slice(-limit).map((t) => ({
      openTime: t.time * 1000,
      open: t.price,
      high: t.price,
      low: t.price,
      close: t.price,
      volume: 0,
      isFinal: true,
    }));
  }

  const bucketed = bucketTicksToIntervalCandles(
    prices.map((p) => ({ time: p.time, price: p.price })),
    interval
  );

  return bucketed.slice(-limit).map((c) => ({
    openTime: c.time * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: 0,
    isFinal: true,
  }));
}

export async function fetchCommodityDepth(symbol, { limit = 20 } = {}) {
  const ticker = await fetchCommodityTicker(symbol);
  return syntheticOrderBook(ticker.price, limit);
}

export function isCommoditySymbol(symbol) {
  const meta = commodityMeta(symbol);
  return meta?.priceSource === 'commodity_inr' || meta?.quoteAsset === 'INR';
}
