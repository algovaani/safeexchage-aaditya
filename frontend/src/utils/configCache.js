const CONFIG_KEY = 'safex_platform_config_v1';
/** bump version whenever pair payload shape changes so stale lists (missing new coins) drop */
const PAIRS_KEY = 'safex_trading_pairs_v2';
const TTL_MS = 60_000;

function read(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore quota */
  }
}

export function readCachedConfig() {
  return read(CONFIG_KEY);
}

export function writeCachedConfig(data) {
  write(CONFIG_KEY, data);
}

export function readCachedPairs() {
  return read(PAIRS_KEY);
}

export function writeCachedPairs(data) {
  write(PAIRS_KEY, data);
}

export function clearCachedPairs() {
  try {
    sessionStorage.removeItem(PAIRS_KEY);
    sessionStorage.removeItem('safex_trading_pairs_v1');
  } catch {
    /* ignore */
  }
}
