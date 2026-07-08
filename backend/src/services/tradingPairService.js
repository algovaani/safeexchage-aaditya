import axios from 'axios';
import { COINGECKO_IDS as DEFAULT_CG_IDS } from '../config/coingeckoIds.js';
import { TRADING_PAIRS as DEFAULT_PAIRS } from '../config/tradingPairs.js';
import { TradingPair } from '../models/TradingPair.js';

const CACHE_MS = 30_000;
const CG_REST = (process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3').replace(/\/$/, '');
const CMC_REST = (process.env.CMC_API_URL || 'https://pro-api.coinmarketcap.com').replace(/\/$/, '');
const CMC_KEY = process.env.CMC_API_KEY?.trim();
const CG_KEY = process.env.COINGECKO_API_KEY?.trim();

const CHAIN_TO_CG_PLATFORM = {
  ethereum: 'ethereum',
  eth: 'ethereum',
  erc20: 'ethereum',
  bsc: 'binance-smart-chain',
  bnb: 'binance-smart-chain',
  bep20: 'binance-smart-chain',
  polygon: 'polygon-pos',
  pol: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  avalanche: 'avalanche',
  avax: 'avalanche',
  base: 'base',
  tron: 'tron',
  trx: 'tron',
  trc20: 'tron',
};

let cache = {
  pairs: [],
  symbols: [],
  bySymbol: new Map(),
  coingeckoIds: {},
  loadedAt: 0,
};

function cgHeaders() {
  const headers = { accept: 'application/json' };
  if (CG_KEY) {
    headers['x-cg-demo-api-key'] = CG_KEY;
    headers['x-cg-pro-api-key'] = CG_KEY;
  }
  return headers;
}

function cmcHeaders() {
  return {
    accept: 'application/json',
    ...(CMC_KEY ? { 'X-CMC_PRO_API_KEY': CMC_KEY } : {}),
  };
}

export function normalizeContractChain(chain) {
  const key = String(chain || 'ethereum').toLowerCase().trim();
  return CHAIN_TO_CG_PLATFORM[key] || key;
}

function defaultPairRows() {
  return DEFAULT_PAIRS.map((p, i) => ({
    symbol: p.symbol,
    baseAsset: p.baseAsset,
    quoteAsset: p.quoteAsset,
    displayPair: p.displayPair,
    name: p.baseAsset,
    coingeckoId: DEFAULT_CG_IDS[p.symbol] || '',
    priceSource: 'binance',
    isActive: true,
    sortOrder: i + 1,
  }));
}

function applyCache(rows) {
  cache.pairs = rows;
  cache.symbols = rows.map((r) => r.symbol);
  cache.bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  cache.coingeckoIds = Object.fromEntries(
    rows.filter((r) => r.coingeckoId).map((r) => [r.symbol, r.coingeckoId])
  );
  cache.loadedAt = Date.now();
  return cache;
}

export async function refreshTradingPairCache() {
  const rows = await TradingPair.find({ isActive: true }).sort({ sortOrder: 1, symbol: 1 }).lean();
  if (!rows.length) {
    return applyCache(defaultPairRows());
  }
  return applyCache(rows);
}

export async function ensureTradingPairCache() {
  if (!cache.symbols.length || Date.now() - cache.loadedAt > CACHE_MS) {
    await refreshTradingPairCache();
  }
  return cache;
}

export function invalidateTradingPairCache() {
  cache.loadedAt = 0;
}

export function getTradingPairSymbolsSync() {
  return cache.symbols.length ? [...cache.symbols] : DEFAULT_PAIRS.map((p) => p.symbol);
}

export function getActivePairsSync() {
  return cache.pairs.length ? [...cache.pairs] : defaultPairRows();
}

export function getPairSync(symbol) {
  const sym = String(symbol || '').toUpperCase().replace(/\//g, '');
  const normalized = sym.endsWith('USDT') ? sym : `${sym}USDT`;
  return cache.bySymbol.get(normalized) || null;
}

export function getCoingeckoIdMapSync() {
  if (Object.keys(cache.coingeckoIds).length) return { ...cache.coingeckoIds };
  return { ...DEFAULT_CG_IDS };
}

export function coinIdForSymbolSync(symbol) {
  const sym = String(symbol || '').toUpperCase();
  return getCoingeckoIdMapSync()[sym] || DEFAULT_CG_IDS[sym] || getPairSync(sym)?.coingeckoId || null;
}

export function formatPairRow(doc) {
  return {
    id: doc._id,
    symbol: doc.symbol,
    baseAsset: doc.baseAsset,
    quoteAsset: doc.quoteAsset,
    displayPair: doc.displayPair,
    name: doc.name || doc.baseAsset,
    imageUrl: doc.imageUrl || '',
    coingeckoId: doc.coingeckoId || '',
    cmcId: doc.cmcId ?? null,
    contractAddress: doc.contractAddress || '',
    contractChain: doc.contractChain || '',
    priceSource: doc.priceSource || 'binance',
    isActive: Boolean(doc.isActive),
    sortOrder: doc.sortOrder ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Seed DB from static defaults if collection is empty. */
export async function seedTradingPairsIfEmpty() {
  const count = await TradingPair.countDocuments();
  if (count > 0) return count;

  const rows = defaultPairRows();
  await TradingPair.insertMany(
    rows.map((r) => ({
      ...r,
      imageUrl: '',
      contractAddress: '',
      contractChain: '',
      cmcId: null,
    }))
  );
  await refreshTradingPairCache();
  return rows.length;
}

async function detectBinanceSymbol(baseAsset) {
  const sym = `${String(baseAsset).toUpperCase()}USDT`;
  try {
    const { data } = await axios.get('https://data-api.binance.vision/api/v3/ticker/price', {
      params: { symbol: sym },
      timeout: 8000,
    });
    if (data?.symbol === sym && Number(data.price) > 0) {
      return { listed: true, symbol: sym };
    }
  } catch {
    /* not on Binance */
  }
  return { listed: false, symbol: sym };
}

function buildPairFromCoinMeta(meta) {
  const baseAsset = String(meta.symbol || '').toUpperCase().slice(0, 12);
  const symbol = `${baseAsset}USDT`;
  return {
    symbol,
    baseAsset,
    quoteAsset: 'USDT',
    displayPair: `${baseAsset}/USDT`,
    name: meta.name || baseAsset,
    imageUrl: meta.imageUrl || '',
    coingeckoId: meta.coingeckoId || '',
    cmcId: meta.cmcId ?? null,
    contractAddress: meta.contractAddress || '',
    contractChain: meta.contractChain || '',
    priceSource: meta.priceSource || 'coingecko',
  };
}

/** Search CoinGecko coin list for admin picker. */
export async function searchCoins(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const { data } = await axios.get(`${CG_REST}/search`, {
    params: { query: q },
    headers: cgHeaders(),
    timeout: 20_000,
  });

  const coins = Array.isArray(data?.coins) ? data.coins : [];
  return coins.slice(0, 30).map((c) => ({
    coingeckoId: c.id,
    name: c.name,
    symbol: String(c.symbol || '').toUpperCase(),
    marketCapRank: c.market_cap_rank ?? null,
    thumb: c.thumb || '',
    large: c.large || '',
    source: 'coingecko',
  }));
}

async function lookupCoinGeckoContract(address, platform) {
  const { data } = await axios.get(`${CG_REST}/coins/${platform}/contract/${address}`, {
    headers: cgHeaders(),
    timeout: 20_000,
  });
  if (!data?.id) return null;

  return {
    coingeckoId: data.id,
    name: data.name,
    symbol: String(data.symbol || '').toUpperCase(),
    imageUrl: data.image?.small || data.image?.thumb || '',
    contractAddress: address,
    contractChain: platform,
    cmcId: null,
    source: 'coingecko',
  };
}

async function lookupCmcContract(address) {
  if (!CMC_KEY) return null;

  const { data } = await axios.get(`${CMC_REST}/v2/cryptocurrency/info`, {
    params: { address },
    headers: cmcHeaders(),
    timeout: 20_000,
  });

  const entries = data?.data ? Object.values(data.data) : [];
  const row = entries[0];
  if (!row) return null;

  return {
    coingeckoId: '',
    cmcId: row.id ?? null,
    name: row.name,
    symbol: String(row.symbol || '').toUpperCase(),
    imageUrl: row.logo || '',
    contractAddress: address,
    contractChain: '',
    source: 'cmc',
  };
}

/** Lookup token by contract — CMC first, then CoinGecko. */
export async function lookupByContract(address, chain = 'ethereum') {
  const addr = String(address || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) {
    throw Object.assign(new Error('Invalid contract address'), { status: 400 });
  }

  let meta = null;
  if (CMC_KEY) {
    try {
      meta = await lookupCmcContract(addr);
    } catch (err) {
      console.warn('[cmc] contract lookup failed:', err.message);
    }
  }

  const platform = normalizeContractChain(chain);
  if (!meta) {
    meta = await lookupCoinGeckoContract(addr, platform);
  } else if (!meta.coingeckoId) {
    try {
      const cg = await lookupCoinGeckoContract(addr, platform);
      if (cg) meta.coingeckoId = cg.coingeckoId;
    } catch {
      /* CMC-only token */
    }
  }

  if (!meta) {
    throw Object.assign(new Error('Token not found for this contract'), { status: 404 });
  }

  const binance = await detectBinanceSymbol(meta.symbol);
  const pairDraft = buildPairFromCoinMeta({
    ...meta,
    priceSource: binance.listed ? 'binance' : 'coingecko',
  });

  return {
    ...pairDraft,
    binanceListed: binance.listed,
    lookupSource: meta.source,
  };
}

/** Resolve CoinGecko list pick into a pair draft. */
export async function resolveCoinGeckoPick(coingeckoId) {
  const id = String(coingeckoId || '').trim();
  if (!id) throw Object.assign(new Error('coingeckoId is required'), { status: 400 });

  const { data } = await axios.get(`${CG_REST}/coins/${id}`, {
    params: {
      localization: false,
      tickers: false,
      market_data: false,
      community_data: false,
      developer_data: false,
    },
    headers: cgHeaders(),
    timeout: 20_000,
  });

  const binance = await detectBinanceSymbol(data.symbol);
  return {
    ...buildPairFromCoinMeta({
      coingeckoId: data.id,
      name: data.name,
      symbol: data.symbol,
      imageUrl: data.image?.small || '',
      contractAddress: '',
      contractChain: '',
      priceSource: binance.listed ? 'binance' : 'coingecko',
    }),
    binanceListed: binance.listed,
    lookupSource: 'coingecko',
  };
}

export async function createTradingPair(body) {
  let draft = body;

  if (body.coingecko_id && !body.symbol) {
    draft = await resolveCoinGeckoPick(body.coingecko_id);
  } else if (body.contract_address) {
    draft = await lookupByContract(body.contract_address, body.contract_chain || 'ethereum');
  }

  const symbol = String(draft.symbol || body.symbol || '').toUpperCase();
  if (!symbol.endsWith('USDT')) {
    throw Object.assign(new Error('Only USDT quote pairs are supported'), { status: 400 });
  }

  const existing = await TradingPair.findOne({ symbol });
  if (existing) {
    throw Object.assign(new Error('Pair already exists'), { status: 409 });
  }

  const maxOrder = await TradingPair.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  const sortOrder = body.sort_order ?? (maxOrder?.sortOrder ?? 0) + 1;

  const pair = await TradingPair.create({
    symbol,
    baseAsset: draft.baseAsset || symbol.replace('USDT', ''),
    quoteAsset: 'USDT',
    displayPair: draft.displayPair || `${symbol.replace('USDT', '')}/USDT`,
    name: draft.name || draft.baseAsset || symbol.replace('USDT', ''),
    imageUrl: draft.imageUrl || body.image_url || '',
    coingeckoId: draft.coingeckoId || body.coingecko_id || '',
    cmcId: draft.cmcId ?? body.cmc_id ?? null,
    contractAddress: draft.contractAddress || body.contract_address || '',
    contractChain: draft.contractChain || body.contract_chain || '',
    priceSource: body.price_source || draft.priceSource || 'coingecko',
    isActive: body.is_active !== false,
    sortOrder,
  });

  invalidateTradingPairCache();
  await refreshTradingPairCache();
  return formatPairRow(pair.toObject());
}

export async function updateTradingPair(id, body) {
  const pair = await TradingPair.findById(id);
  if (!pair) throw Object.assign(new Error('Pair not found'), { status: 404 });

  if (body.is_active != null) pair.isActive = Boolean(body.is_active);
  if (body.sort_order != null) pair.sortOrder = Number(body.sort_order);
  if (body.price_source != null) pair.priceSource = body.price_source;
  if (body.name != null) pair.name = String(body.name).trim();
  if (body.coingecko_id != null) pair.coingeckoId = String(body.coingecko_id).trim();

  await pair.save();
  invalidateTradingPairCache();
  await refreshTradingPairCache();
  return formatPairRow(pair.toObject());
}

export async function deleteTradingPair(id) {
  const pair = await TradingPair.findByIdAndDelete(id);
  if (!pair) throw Object.assign(new Error('Pair not found'), { status: 404 });
  invalidateTradingPairCache();
  await refreshTradingPairCache();
  return formatPairRow(pair.toObject());
}

export async function listTradingPairs({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  const rows = await TradingPair.find(filter).sort({ sortOrder: 1, symbol: 1 }).lean();
  if (!rows.length && !includeInactive) {
    return defaultPairRows().map((r, i) => ({ ...r, id: `default-${i}` }));
  }
  return rows.map(formatPairRow);
}
