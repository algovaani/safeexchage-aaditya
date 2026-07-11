const CONFIG_KEY = 'safex_platform_config_v1';
const PAIRS_KEY = 'safex_trading_pairs_v1';
const TTL_MS = 5 * 60 * 1000;

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
