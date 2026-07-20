import axios from 'axios';

const DEX_API = (process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com').replace(/\/$/, '');

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

function client() {
  return axios.create({
    baseURL: DEX_API,
    timeout: 20_000,
    headers: { accept: 'application/json' },
  });
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

  const { data } = await client().get('/latest/dex/search', { params: { q } });
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
    const { data } = await client().get(`/token-pairs/v1/${chainId}/${addr}`);
    pairs = Array.isArray(data) ? data : Array.isArray(data?.pairs) ? data.pairs : [];
  } catch {
    /* try search fallback */
  }

  if (!pairs.length) {
    const { data } = await client().get('/latest/dex/search', { params: { q: addr } });
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

  const { data } = await client().get(`/latest/dex/pairs/${chain}/${pair}`);
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

/**
 * Fetch live USD prices for a list of { symbol, dexChainId, dexPairAddress }.
 */
export async function fetchDexPairPrices(pairDefs = []) {
  const defs = (pairDefs || []).filter((p) => p?.dexChainId && p?.dexPairAddress && p?.symbol);
  if (!defs.length) return [];

  const results = await Promise.all(
    defs.map(async (def) => {
      try {
        const { data } = await client().get(
          `/latest/dex/pairs/${def.dexChainId}/${def.dexPairAddress}`
        );
        const rows = Array.isArray(data?.pairs) ? data.pairs : data?.pair ? [data.pair] : [];
        const pair = pickBestPair(rows) || rows[0];
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
        };
      } catch (err) {
        console.warn(`[dexscreener] price ${def.symbol}:`, err.message);
        return null;
      }
    })
  );

  return results.filter(Boolean);
}
