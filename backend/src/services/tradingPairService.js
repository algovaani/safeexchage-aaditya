import axios from 'axios';
import { COINGECKO_IDS as DEFAULT_CG_IDS } from '../config/coingeckoIds.js';
import { TRADING_PAIRS as DEFAULT_PAIRS } from '../config/tradingPairs.js';
import { COMMODITY_PAIRS, DISABLED_COMMODITY_SYMBOLS } from '../config/commodityPairs.js';
import { TradingPair } from '../models/TradingPair.js';
import {
  lookupDexByContract,
  resolveDexPair,
  searchDexPairs,
} from './dexscreenerService.js';

const CACHE_MS = 30_000;

let cache = {
  pairs: [],
  symbols: [],
  bySymbol: new Map(),
  coingeckoIds: {},
  loadedAt: 0,
};

export function normalizeContractChain(chain) {
  return String(chain || 'ethereum').toLowerCase().trim();
}

function defaultPairRows() {
  const crypto = DEFAULT_PAIRS.map((p, i) => ({
    symbol: p.symbol,
    baseAsset: p.baseAsset,
    quoteAsset: p.quoteAsset,
    displayPair: p.displayPair,
    name: p.baseAsset,
    coingeckoId: DEFAULT_CG_IDS[p.symbol] || '',
    priceSource: 'binance',
    category: 'crypto',
    isActive: true,
    sortOrder: i + 1,
  }));
  return crypto;
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
  if (cache.bySymbol.has(sym)) return cache.bySymbol.get(sym) || null;
  if (sym.endsWith('INR')) return cache.bySymbol.get(sym) || null;
  const withUsdt = sym.endsWith('USDT') ? sym : `${sym}USDT`;
  return cache.bySymbol.get(withUsdt) || null;
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
    dexPairAddress: doc.dexPairAddress || '',
    dexChainId: doc.dexChainId || '',
    priceSource: doc.priceSource || 'binance',
    category: doc.category || 'crypto',
    unit: doc.unit || '',
    isActive: Boolean(doc.isActive),
    sortOrder: doc.sortOrder ?? 0,
    depositWalletAddress: doc.depositWalletAddress || '',
    depositNetwork: doc.depositNetwork || '',
    depositEnabled: doc.depositEnabled !== false,
    priceAuto: doc.priceAuto !== false,
    manualPrice: doc.manualPrice != null && Number.isFinite(Number(doc.manualPrice)) ? Number(doc.manualPrice) : null,
    manualChange24h:
      doc.manualChange24h != null && Number.isFinite(Number(doc.manualChange24h))
        ? Number(doc.manualChange24h)
        : null,
    manualHigh24h:
      doc.manualHigh24h != null && Number.isFinite(Number(doc.manualHigh24h)) ? Number(doc.manualHigh24h) : null,
    manualLow24h:
      doc.manualLow24h != null && Number.isFinite(Number(doc.manualLow24h)) ? Number(doc.manualLow24h) : null,
    manualVolume:
      doc.manualVolume != null && Number.isFinite(Number(doc.manualVolume)) ? Number(doc.manualVolume) : null,
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

/** Deactivate Gold/Silver (and any other disabled commodity symbols). */
export async function ensureCommodityPairs() {
  const symbols = [
    ...DISABLED_COMMODITY_SYMBOLS,
    ...COMMODITY_PAIRS.map((p) => p.symbol),
  ].filter(Boolean);

  if (symbols.length) {
    await TradingPair.updateMany(
      { symbol: { $in: symbols.map((s) => String(s).toUpperCase()) } },
      { $set: { isActive: false } }
    );
  }

  invalidateTradingPairCache();
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

async function uniqueUsdtSymbol(baseAsset, contractAddress = '') {
  const base = String(baseAsset || 'TOKEN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12) || 'TOKEN';
  let candidate = `${base}USDT`;
  const exists = await TradingPair.findOne({ symbol: candidate }).lean();
  if (!exists) return { baseAsset: base, symbol: candidate, displayPair: `${base}/USDT` };

  const suffix = String(contractAddress || '')
    .replace(/^0x/i, '')
    .slice(-4)
    .toUpperCase();
  const altBase = `${base.slice(0, 8)}${suffix || 'X'}`.slice(0, 12);
  candidate = `${altBase}USDT`;
  const exists2 = await TradingPair.findOne({ symbol: candidate }).lean();
  if (!exists2) return { baseAsset: altBase, symbol: candidate, displayPair: `${altBase}/USDT` };

  throw Object.assign(new Error(`Symbol collision for ${base}USDT — rename or remove the existing pair`), {
    status: 409,
  });
}

/** Search DexScreener for admin picker (name, symbol, or contract). */
export async function searchCoins(query) {
  return searchDexPairs(query);
}

/** Lookup token by contract via DexScreener pools. */
export async function lookupByContract(address, chain = 'ethereum') {
  const draft = await lookupDexByContract(address, chain);
  const binance = await detectBinanceSymbol(draft.baseAsset);
  return {
    ...draft,
    priceSource: binance.listed ? 'binance' : 'dexscreener',
    binanceListed: binance.listed,
    lookupSource: 'dexscreener',
  };
}

/** Resolve a DexScreener search/select hit into a confirmable draft. */
export async function resolveDexPick({ chainId, pairAddress }) {
  const draft = await resolveDexPair(chainId, pairAddress);
  const binance = await detectBinanceSymbol(draft.baseAsset);
  return {
    ...draft,
    priceSource: binance.listed ? 'binance' : 'dexscreener',
    binanceListed: binance.listed,
    lookupSource: 'dexscreener',
  };
}

/** @deprecated kept for old clients — routes to Dex when possible */
export async function resolveCoinGeckoPick(coingeckoId) {
  throw Object.assign(
    new Error('CoinGecko add flow removed. Search DexScreener and select a pool instead.'),
    { status: 410 }
  );
}

export async function createTradingPair(body) {
  let draft = body;

  if (body.dex_pair_address && body.dex_chain_id) {
    draft = await resolveDexPick({
      chainId: body.dex_chain_id,
      pairAddress: body.dex_pair_address,
    });
  } else if (body.contract_address) {
    draft = await lookupByContract(body.contract_address, body.contract_chain || 'ethereum');
  } else if (body.coingecko_id && !body.symbol) {
    throw Object.assign(
      new Error('CoinGecko add removed. Use DexScreener search or contract address.'),
      { status: 400 }
    );
  }

  const naming = await uniqueUsdtSymbol(
    draft.baseAsset || String(draft.symbol || '').replace(/USDT$/i, ''),
    draft.contractAddress || body.contract_address || ''
  );

  const existing = await TradingPair.findOne({ symbol: naming.symbol });
  if (existing) {
    throw Object.assign(new Error('Pair already exists'), { status: 409 });
  }

  if (draft.dexPairAddress && draft.dexChainId) {
    const dupDex = await TradingPair.findOne({
      dexChainId: draft.dexChainId,
      dexPairAddress: draft.dexPairAddress,
    }).lean();
    if (dupDex) {
      throw Object.assign(new Error('This DEX pair is already listed on the exchange'), { status: 409 });
    }
  }

  const maxOrder = await TradingPair.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  const sortOrder = body.sort_order ?? (maxOrder?.sortOrder ?? 0) + 1;

  const priceSource =
    body.price_source ||
    draft.priceSource ||
    (draft.dexPairAddress ? 'dexscreener' : 'binance');

  const pair = await TradingPair.create({
    symbol: naming.symbol,
    baseAsset: naming.baseAsset,
    quoteAsset: 'USDT',
    displayPair: naming.displayPair,
    name: draft.name || naming.baseAsset,
    imageUrl: draft.imageUrl || body.image_url || '',
    coingeckoId: draft.coingeckoId || body.coingecko_id || '',
    cmcId: draft.cmcId ?? body.cmc_id ?? null,
    contractAddress: draft.contractAddress || body.contract_address || '',
    contractChain: draft.contractChain || body.contract_chain || draft.dexChainId || '',
    dexPairAddress: draft.dexPairAddress || body.dex_pair_address || '',
    dexChainId: draft.dexChainId || body.dex_chain_id || '',
    priceSource,
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
  if (body.image_url != null) pair.imageUrl = String(body.image_url).trim();
  if (body.dex_pair_address != null) pair.dexPairAddress = String(body.dex_pair_address).trim();
  if (body.dex_chain_id != null) pair.dexChainId = String(body.dex_chain_id).trim().toLowerCase();
  if (body.deposit_wallet_address != null) {
    pair.depositWalletAddress = String(body.deposit_wallet_address).trim();
  }
  if (body.deposit_network != null) pair.depositNetwork = String(body.deposit_network).trim().toUpperCase();
  if (body.deposit_enabled != null) pair.depositEnabled = Boolean(body.deposit_enabled);

  if (body.price_auto != null) pair.priceAuto = Boolean(body.price_auto);

  const toNumOrNull = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  if (body.manual_price !== undefined) {
    const n = toNumOrNull(body.manual_price);
    if (n != null && n <= 0) {
      throw Object.assign(new Error('manual_price must be a positive number'), { status: 400 });
    }
    pair.manualPrice = n;
  }
  if (body.manual_change_24h !== undefined) pair.manualChange24h = toNumOrNull(body.manual_change_24h);
  if (body.manual_high_24h !== undefined) pair.manualHigh24h = toNumOrNull(body.manual_high_24h);
  if (body.manual_low_24h !== undefined) pair.manualLow24h = toNumOrNull(body.manual_low_24h);
  if (body.manual_volume !== undefined) {
    const n = toNumOrNull(body.manual_volume);
    if (n != null && n < 0) {
      throw Object.assign(new Error('manual_volume cannot be negative'), { status: 400 });
    }
    pair.manualVolume = n;
  }

  if (pair.priceAuto === false && !(Number(pair.manualPrice) > 0)) {
    throw Object.assign(new Error('Enter a manual price when Auto update is off'), { status: 400 });
  }
  if (
    pair.manualHigh24h != null &&
    pair.manualLow24h != null &&
    Number(pair.manualLow24h) > Number(pair.manualHigh24h)
  ) {
    throw Object.assign(new Error('manual_low_24h cannot be greater than manual_high_24h'), { status: 400 });
  }

  // Volume always = |high − low| when both manual high/low are set
  if (
    pair.priceAuto === false &&
    pair.manualHigh24h != null &&
    pair.manualLow24h != null
  ) {
    pair.manualVolume = Math.abs(Number(pair.manualHigh24h) - Number(pair.manualLow24h));
  }

  await pair.save();
  invalidateTradingPairCache();
  try {
    const { invalidatePriceCache } = await import('./marketDataProvider.js');
    invalidatePriceCache();
  } catch {
    /* price cache module optional during tests */
  }
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

export function depositNetworkToChain(network) {
  const n = String(network || '').toUpperCase();
  if (n.includes('BEP') || n === 'BSC' || n === 'BNB') return 'BNB';
  if (n.includes('ERC') || n === 'ETH') return 'ETH';
  if (n.includes('TRC') || n === 'TRX' || n === 'TRON') return 'TRC';
  return '';
}

export async function findActivePairForDeposit(baseAsset) {
  const base = String(baseAsset || '').toUpperCase();
  const rows = await TradingPair.find({ baseAsset: base, isActive: true }).lean();
  if (!rows.length) return null;
  return rows.find((r) => r.quoteAsset === 'USDT') || rows[0];
}

/** Per-coin deposit wallet from trading_pairs; null if should use platform default. */
export async function resolveCoinDepositAddress(settings, currency, chainHint = '') {
  const pair = await findActivePairForDeposit(currency);
  if (!pair || pair.depositEnabled === false) return null;

  const custom = String(pair.depositWalletAddress || '').trim();
  const network = pair.depositNetwork || '';
  const chain =
    depositNetworkToChain(network) ||
    String(chainHint || '').toUpperCase() ||
    depositNetworkToChain(pair.dexChainId || pair.contractChain || '');

  if (custom) {
    return {
      chain,
      address: custom,
      network: network || chain,
      currency: String(currency || pair.baseAsset).toUpperCase(),
      coinSpecific: true,
      mode: 'manual',
      isPlatformWallet: true,
    };
  }
  return null;
}
