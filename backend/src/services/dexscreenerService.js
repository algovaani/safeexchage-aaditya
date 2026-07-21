import axios from 'axios';

const DEX_API = (process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com').replace(/\/$/, '');

/** Min gap between DexScreener HTTP calls (public API is strict). */
const DEX_MIN_GAP_MS = Number(process.env.DEXSCREENER_MIN_GAP_MS) || 400;
/** Reuse last good price this long before hitting the API again. */
const DEX_CACHE_TTL_MS = Number(process.env.DEXSCREENER_CACHE_TTL_MS) || 25_000;
/** After HTTP 429, pause all Dex fetches for this long. */
const DEX_429_COOLDOWN_MS = Number(process.env.DEXSCREENER_429_COOLDOWN_MS) || 90_000;

/** Our admin chain keys → DexScreener chainId */
export const CHAIN_TO_DEX = {
  ethereum: 'ethereum',
  eth: 'ethereum',
  erc20: 'ethereum',
  bsc: 'bsc',
  bnb: 'bsc',
  bep20: 'bsc',
  polygon: 'polygon',
  pol: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  avalanche: 'avalanche',
  avax: 'avalanche',
  solana: 'solana',
  tron: 'tron',
};

const STABLE_QUOTES = new Set(['USDT', 'USDC', 'USD1', 'DAI', 'BUSD', 'FDUSD']);

/** @type {Map<string, { row: object, fetchedAt: number }>} */
const priceCache = new Map();
let rateLimitedUntil = 0;
let lastWarnAt = 0;
let lastRequestAt = 0;
let queue = Promise.resolve();

function client() {
  return axios.create({
    baseURL: DEX_API,
    timeout: 12_000,
    headers: { accept: 'application/json' },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function warnThrottled(message) {
  const now = Date.now();
  if (now - lastWarnAt < 30_000) return;
  lastWarnAt = now;
  console.warn(`[dexscreener] ${message}`);
}

/**
 * Serialize Dex HTTP calls with a minimum gap so we don't stampede the API.
 */
async function dexGet(path, config) {
  const run = async () => {
    const now = Date.now();
    if (now < rateLimitedUntil) {
      const err = new Error(`DexScreener cooling down (${Math.ceil((rateLimitedUntil - now) / 1000)}s)`);
      err.status = 429;
      throw err;
    }
    const wait = Math.max(0, DEX_MIN_GAP_MS - (now - lastRequestAt));
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      return await client().get(path, config);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        rateLimitedUntil = Date.now() + DEX_429_COOLDOWN_MS;
        warnThrottled(`rate limited (429) — cooling down ${DEX_429_COOLDOWN_MS / 1000}s, serving cache`);
      }
      throw err;
    }
  };

  const next = queue.then(run, run);
  // Keep queue alive even if this request fails
  queue = next.catch(() => {});
  return next;
}

export function normalizeDexChain(chain) {
  const key = String(chain || 'ethereum').toLowerCase().trim();
  return CHAIN_TO_DEX[key] || key;
}

function liquidityUsd(pair) {
  return Number(pair?.liquidity?.usd ?? 0) || 0;
}

function priceChange24h(pair) {
  const pc = pair?.priceChange;
  return Number(pc?.h24 ?? pc?.['24h'] ?? 0) || 0;
}

function volume24h(pair) {
  return Number(pair?.volume?.h24 ?? 0) || 0;
}

/** Prefer USDT/USDC pools, then highest liquidity. */
export function pickBestPair(pairs = []) {
  const list = (Array.isArray(pairs) ? pairs : []).filter((p) => Number(p?.priceUsd) > 0);
  if (!list.length) return null;

  const scored = [...list].sort((a, b) => {
    const aq = STABLE_QUOTES.has(String(a.quoteToken?.symbol || '').toUpperCase()) ? 1 : 0;
    const bq = STABLE_QUOTES.has(String(b.quoteToken?.symbol || '').toUpperCase()) ? 1 : 0;
    if (bq !== aq) return bq - aq;
    return liquidityUsd(b) - liquidityUsd(a);
  });
  return scored[0];
}

export function mapDexPairToDraft(pair) {
  if (!pair) return null;
  const base = pair.baseToken || {};
  const symbolRaw = String(base.symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  const baseAsset = symbolRaw || 'TOKEN';
  return {
    symbol: `${baseAsset}USDT`,
    baseAsset,
    quoteAsset: 'USDT',
    displayPair: `${baseAsset}/USDT`,
    name: base.name || baseAsset,
    imageUrl: pair.info?.imageUrl || '',
    contractAddress: String(base.address || '').toLowerCase(),
    contractChain: pair.chainId || '',
    dexPairAddress: pair.pairAddress || '',
    dexChainId: pair.chainId || '',
    dexUrl: pair.url || '',
    priceUsd: Number(pair.priceUsd) || 0,
    liquidityUsd: liquidityUsd(pair),
    volume24h: volume24h(pair),
    change24h: priceChange24h(pair),
    quoteSymbol: pair.quoteToken?.symbol || '',
    dexId: pair.dexId || '',
    priceSource: 'dexscreener',
    lookupSource: 'dexscreener',
  };
}

/**
 * Search DexScreener by name / symbol / contract.
 * Returns a flat selectable list (deduped by pairAddress).
 */
export async function searchDexPairs(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const { data } = await dexGet('/latest/dex/search', { params: { q } });
  const pairs = Array.isArray(data?.pairs) ? data.pairs : Array.isArray(data) ? data : [];

  const seen = new Set();
  const rows = [];
  for (const pair of pairs) {
    const draft = mapDexPairToDraft(pair);
    if (!draft?.dexPairAddress || !draft.priceUsd) continue;
    const key = `${draft.dexChainId}:${draft.dexPairAddress}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      ...draft,
      thumb: draft.imageUrl,
      source: 'dexscreener',
      label: `${draft.name} (${draft.baseAsset}) · ${draft.dexChainId}/${draft.quoteSymbol}`,
      liquidityLabel:
        draft.liquidityUsd >= 1000
          ? `$${(draft.liquidityUsd / 1000).toFixed(1)}k liq`
          : `$${draft.liquidityUsd.toFixed(0)} liq`,
    });
    if (rows.length >= 40) break;
  }

  return rows.sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
}

/** Lookup token contract on a chain → best liquid pair draft. */
export async function lookupDexByContract(address, chain = 'ethereum') {
  const addr = String(address || '').trim();
  const chainId = normalizeDexChain(chain);
  if (!addr) {
    throw Object.assign(new Error('Contract / token address is required'), { status: 400 });
  }

  let pairs = [];
  try {
    const { data } = await dexGet(`/token-pairs/v1/${chainId}/${addr}`);
    pairs = Array.isArray(data) ? data : Array.isArray(data?.pairs) ? data.pairs : [];
  } catch {
    /* try search fallback */
  }

  if (!pairs.length) {
    const { data } = await dexGet('/latest/dex/search', { params: { q: addr } });
    const all = Array.isArray(data?.pairs) ? data.pairs : [];
    pairs = all.filter(
      (p) =>
        String(p.chainId).toLowerCase() === chainId &&
        String(p.baseToken?.address || '').toLowerCase() === addr.toLowerCase()
    );
    if (!pairs.length) pairs = all;
  }

  const best = pickBestPair(pairs);
  if (!best) {
    throw Object.assign(new Error('No DEX pool found for this token'), { status: 404 });
  }

  return {
    ...mapDexPairToDraft(best),
    binanceListed: false,
  };
}

/** Resolve a specific Dex pair by chain + pair address. */
export async function resolveDexPair(chainId, pairAddress) {
  const chain = normalizeDexChain(chainId);
  const pair = String(pairAddress || '').trim();
  if (!chain || !pair) {
    throw Object.assign(new Error('chain and pair address are required'), { status: 400 });
  }

  const { data } = await dexGet(`/latest/dex/pairs/${chain}/${pair}`);
  const rows = Array.isArray(data?.pairs) ? data.pairs : data?.pair ? [data.pair] : [];
  const best = pickBestPair(rows) || rows[0];
  if (!best) {
    throw Object.assign(new Error('Dex pair not found'), { status: 404 });
  }
  return {
    ...mapDexPairToDraft(best),
    binanceListed: false,
  };
}

function cacheKey(def) {
  return `${String(def.symbol).toUpperCase()}|${def.dexChainId}|${def.dexPairAddress}`.toLowerCase();
}

function mapLiveRow(def, pair) {
  const price = Number(pair?.priceUsd);
  if (!(price > 0)) return null;
  return {
    symbol: def.symbol,
    name: pair?.baseToken?.name || def.symbol,
    price,
    change_24h: priceChange24h(pair),
    high_24h: price,
    low_24h: price,
    volume: volume24h(pair),
    quoteVolume: volume24h(pair),
    marketCap: Number(pair?.marketCap || pair?.fdv) || 0,
    provider: 'dexscreener',
    stale: false,
  };
}

async function fetchOneDexPrice(def) {
  const key = cacheKey(def);
  const cached = priceCache.get(key);
  const now = Date.now();

  if (cached?.row && now - cached.fetchedAt < DEX_CACHE_TTL_MS) {
    return { ...cached.row, stale: false };
  }

  if (now < rateLimitedUntil) {
    if (cached?.row) return { ...cached.row, stale: true };
    return null;
  }

  try {
    const { data } = await dexGet(`/latest/dex/pairs/${def.dexChainId}/${def.dexPairAddress}`);
    const rows = Array.isArray(data?.pairs) ? data.pairs : data?.pair ? [data.pair] : [];
    const pair = pickBestPair(rows) || rows[0];
    const row = mapLiveRow(def, pair);
    if (row) {
      priceCache.set(key, { row, fetchedAt: Date.now() });
      return row;
    }
  } catch (err) {
    if (err.status !== 429 && err.response?.status !== 429) {
      warnThrottled(`price ${def.symbol}: ${err.message}`);
    }
  }

  if (cached?.row) return { ...cached.row, stale: true };
  return null;
}

/**
 * Fetch live USD prices for a list of { symbol, dexChainId, dexPairAddress }.
 * Rate-limited + cached — never parallel-stampede DexScreener.
 */
export async function fetchDexPairPrices(pairDefs = []) {
  const defs = (pairDefs || []).filter((p) => p?.dexChainId && p?.dexPairAddress && p?.symbol);
  if (!defs.length) return [];

  const results = [];
  for (const def of defs) {
    try {
      const row = await fetchOneDexPrice(def);
      if (row) results.push(row);
    } catch (err) {
      // Never throw out of price poll — keep process alive
      warnThrottled(`price ${def.symbol}: ${err.message}`);
      const cached = priceCache.get(cacheKey(def));
      if (cached?.row) results.push({ ...cached.row, stale: true });
    }
  }

  return results;
}

/** Last known Dex price for a symbol (any chain), or null. */
export function getCachedDexPrice(symbol) {
  const sym = String(symbol || '').toUpperCase();
  for (const { row } of priceCache.values()) {
    if (row?.symbol === sym && row.price > 0) return row;
  }
  return null;
}
