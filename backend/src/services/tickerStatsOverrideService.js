import { TickerStatsOverride } from '../models/TickerStatsOverride.js';

/** @type {Map<string, object>|null} */
let overrideCache = null;
let overrideCacheAt = 0;
const OVERRIDE_CACHE_TTL_MS = 5_000;

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function toNullableNumber(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatTickerStatsOverride(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    symbol: doc.symbol,
    change_24h: doc.change_24h,
    high_24h: doc.high_24h,
    low_24h: doc.low_24h,
    volume: doc.volume,
    quoteVolume: doc.quoteVolume,
    enabled: doc.enabled !== false,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

export function invalidateTickerStatsOverrideCache() {
  overrideCache = null;
  overrideCacheAt = 0;
}

async function loadOverrideMap({ force = false } = {}) {
  const now = Date.now();
  if (!force && overrideCache && now - overrideCacheAt < OVERRIDE_CACHE_TTL_MS) {
    return overrideCache;
  }

  const rows = await TickerStatsOverride.find({ enabled: true }).lean();
  const map = new Map();
  for (const row of rows) {
    map.set(normalizeSymbol(row.symbol), row);
  }
  overrideCache = map;
  overrideCacheAt = now;
  return map;
}

export async function getTickerStatsOverride(symbol) {
  const sym = normalizeSymbol(symbol);
  if (!sym) return null;
  const map = await loadOverrideMap();
  return map.get(sym) || null;
}

export async function listTickerStatsOverrides() {
  const rows = await TickerStatsOverride.find().sort({ symbol: 1 }).lean();
  return rows.map(formatTickerStatsOverride);
}

/**
 * Apply admin display overrides onto a live ticker row.
 * Also adjusts open_24h so clients that recompute change% from open still match.
 */
export function applyTickerStatsOverride(row, override) {
  if (!row || !override || override.enabled === false) return row;

  const next = { ...row, stats_override: true };
  const price = Number(next.price ?? next.lastPrice);

  if (override.change_24h != null && Number.isFinite(Number(override.change_24h))) {
    const pct = Number(override.change_24h);
    next.change_24h = pct;
    if (Number.isFinite(price) && price > 0) {
      const open = price / (1 + pct / 100);
      next.open_24h = open;
      next.change_24h_abs = price - open;
    }
  }

  if (override.high_24h != null && Number.isFinite(Number(override.high_24h))) {
    next.high_24h = Number(override.high_24h);
  }
  if (override.low_24h != null && Number.isFinite(Number(override.low_24h))) {
    next.low_24h = Number(override.low_24h);
  }
  if (override.volume != null && Number.isFinite(Number(override.volume))) {
    next.volume = Number(override.volume);
  }
  if (override.quoteVolume != null && Number.isFinite(Number(override.quoteVolume))) {
    next.quoteVolume = Number(override.quoteVolume);
  }

  return next;
}

export async function applyTickerStatsOverridesToPairs(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return pairs || [];
  const map = await loadOverrideMap();
  if (!map.size) return pairs;
  return pairs.map((row) => applyTickerStatsOverride(row, map.get(normalizeSymbol(row.symbol))));
}

export async function upsertTickerStatsOverride(symbol, body, updatedBy = null) {
  const sym = normalizeSymbol(symbol);
  if (!sym) {
    throw Object.assign(new Error('symbol is required'), { status: 400 });
  }

  const patch = {
    change_24h: toNullableNumber(body.change_24h),
    high_24h: toNullableNumber(body.high_24h),
    low_24h: toNullableNumber(body.low_24h),
    volume: toNullableNumber(body.volume),
    quoteVolume: toNullableNumber(body.quoteVolume),
    enabled: body.enabled === false ? false : true,
    updatedBy: updatedBy || null,
  };

  const hasAny =
    patch.change_24h != null ||
    patch.high_24h != null ||
    patch.low_24h != null ||
    patch.volume != null ||
    patch.quoteVolume != null;

  if (!hasAny) {
    throw Object.assign(new Error('Provide at least one of: change_24h, high_24h, low_24h, volume, quoteVolume'), {
      status: 400,
    });
  }

  if (patch.high_24h != null && patch.low_24h != null && patch.low_24h > patch.high_24h) {
    throw Object.assign(new Error('low_24h cannot be greater than high_24h'), { status: 400 });
  }

  const doc = await TickerStatsOverride.findOneAndUpdate(
    { symbol: sym },
    { $set: { symbol: sym, ...patch } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  invalidateTickerStatsOverrideCache();
  return formatTickerStatsOverride(doc);
}

export async function clearTickerStatsOverride(symbol) {
  const sym = normalizeSymbol(symbol);
  if (!sym) {
    throw Object.assign(new Error('symbol is required'), { status: 400 });
  }
  await TickerStatsOverride.deleteOne({ symbol: sym });
  invalidateTickerStatsOverrideCache();
  return { symbol: sym, cleared: true };
}
