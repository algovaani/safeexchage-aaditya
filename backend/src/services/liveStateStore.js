/**
 * Live market state — L1 memory + L2 Redis for multi-server sync.
 * Reads always hit L1 first (zero latency). Redis keeps instances aligned.
 */
import { getRedis, isRedisReady } from '../config/redis.js';

const PRICE_TTL_SEC = 120;
const CANDLE_TTL_SEC = 600;

/** @type {Map<string, object>} */
const priceL1 = new Map();
/** @type {Map<string, object>} */
const candleL1 = new Map();

function priceKey(symbol) {
  return `live:price:${String(symbol).toUpperCase()}`;
}

function candleKey(symbol, interval) {
  return `live:candle:${String(symbol).toUpperCase()}:${String(interval).toLowerCase()}`;
}

function candleL1Key(symbol, interval) {
  return `${String(symbol).toUpperCase()}|${String(interval).toLowerCase()}`;
}

export function setLivePriceLocal(symbol, state) {
  const sym = String(symbol || '').toUpperCase();
  if (!state?.effectivePrice) return state;
  priceL1.set(sym, { ...state, timestamp: state.timestamp || Date.now() });
  return state;
}

export function getLivePriceLocal(symbol) {
  return priceL1.get(String(symbol || '').toUpperCase()) || null;
}

export async function setLivePrice(symbol, state) {
  const entry = setLivePriceLocal(symbol, state);
  if (!entry || !isRedisReady()) return entry;

  const redis = getRedis();
  redis
    .set(priceKey(symbol), JSON.stringify(entry), 'EX', PRICE_TTL_SEC)
    .catch(() => {});
  return entry;
}

export async function getLivePrice(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const local = priceL1.get(sym);
  if (local) return local;

  if (!isRedisReady()) return null;

  try {
    const raw = await getRedis().get(priceKey(sym));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    priceL1.set(sym, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function setLiveCandleLocal(symbol, interval, candle) {
  if (!candle) return null;
  const k = candleL1Key(symbol, interval);
  candleL1.set(k, { ...candle });
  return candle;
}

export function getLiveCandleLocal(symbol, interval) {
  return candleL1.get(candleL1Key(symbol, interval)) || null;
}

export async function setLiveCandle(symbol, interval, candle) {
  const c = setLiveCandleLocal(symbol, interval, candle);
  if (!c || !isRedisReady()) return c;

  const redis = getRedis();
  redis
    .set(candleKey(symbol, interval), JSON.stringify(c), 'EX', CANDLE_TTL_SEC)
    .catch(() => {});
  return c;
}

export async function getLiveCandle(symbol, interval) {
  const local = getLiveCandleLocal(symbol, interval);
  if (local) return local;

  if (!isRedisReady()) return null;

  try {
    const raw = await getRedis().get(candleKey(symbol, interval));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    setLiveCandleLocal(symbol, interval, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function clearLiveCandlesLocal(symbol, interval = null) {
  const sym = String(symbol || '').toUpperCase();
  if (interval) {
    candleL1.delete(candleL1Key(sym, interval));
    if (isRedisReady()) {
      getRedis().del(candleKey(sym, interval)).catch(() => {});
    }
    return;
  }
  for (const k of [...candleL1.keys()]) {
    if (k.startsWith(`${sym}|`)) candleL1.delete(k);
  }
}

export function getAllLivePricesLocal() {
  return Object.fromEntries(priceL1);
}
