/**
 * Stale-while-revalidate cache for instant UI paint.
 * - localStorage: small JSON (prices, summary, wallet)
 * - IndexedDB: larger payloads (klines)
 *
 * Redis is NOT used here — client cache is what makes pages feel instant.
 */

const LS_PREFIX = 'safex_swr:';
const IDB_NAME = 'safex_swr_v1';
const IDB_STORE = 'cache';
const DEFAULT_MAX_AGE_MS = 30 * 60_000; // keep for paint up to 30 min

let idbPromise = null;

function lsKey(key) {
  return `${LS_PREFIX}${key}`;
}

export function readSwrSync(key, { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.at == null) return null;
    if (maxAgeMs > 0 && Date.now() - parsed.at > maxAgeMs) return null;
    return { data: parsed.data, at: parsed.at, stale: true };
  } catch {
    return null;
  }
}

export function writeSwrSync(key, data) {
  try {
    localStorage.setItem(lsKey(key), JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota / private mode */
  }
}

function openIdb() {
  if (idbPromise) return idbPromise;
  if (typeof indexedDB === 'undefined') {
    idbPromise = Promise.resolve(null);
    return idbPromise;
  }
  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

export async function readSwrIdb(key, { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const db = await openIdb();
  if (!db) return readSwrSync(key, { maxAgeMs });
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const parsed = req.result;
        if (!parsed || parsed.at == null) {
          resolve(null);
          return;
        }
        if (maxAgeMs > 0 && Date.now() - parsed.at > maxAgeMs) {
          resolve(null);
          return;
        }
        resolve({ data: parsed.data, at: parsed.at, stale: true });
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeSwrIdb(key, data) {
  const db = await openIdb();
  if (!db) {
    writeSwrSync(key, data);
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ at: Date.now(), data }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Cache keys used across the app */
export const SwrKeys = {
  livePrices: 'live_prices_v1',
  dashboardSummary: 'dashboard_summary_v1',
  walletBalance: 'wallet_balance_v1',
  klines: (symbol, interval) => `klines:${String(symbol).toUpperCase()}:${interval}`,
};
