const CONFIG_KEY = 'safex_platform_config_v1';
/** bump version whenever pair payload shape changes so stale lists (missing new coins) drop */
const PAIRS_KEY = 'safex_trading_pairs_v2';
/** Prefer showing stale pairs/config instantly; background refresh keeps them fresh. */
const MAX_AGE_MS = 30 * 60_000;
const FRESH_MS = 60_000;

function read(key) {
  try {
    // Prefer localStorage (survives tab close) then sessionStorage
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at) return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function write(key, data) {
  const payload = JSON.stringify({ at: Date.now(), data });
  try {
    localStorage.setItem(key, payload);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(key, payload);
  } catch {
    /* ignore */
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
    localStorage.removeItem(PAIRS_KEY);
    sessionStorage.removeItem(PAIRS_KEY);
    sessionStorage.removeItem('safex_trading_pairs_v1');
    localStorage.removeItem('safex_trading_pairs_v1');
  } catch {
    /* ignore */
  }
}

export function isCacheFresh(key = PAIRS_KEY, freshMs = FRESH_MS) {
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.at && Date.now() - parsed.at < freshMs);
  } catch {
    return false;
  }
}
