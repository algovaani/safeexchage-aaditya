import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, parseApiResponse } from '../api/client.js';
import { TRADING_PAIRS as FALLBACK_PAIRS } from '../config/tradingPairs.js';
import { clearCachedPairs, readCachedPairs, writeCachedPairs } from '../utils/configCache.js';

const TradingPairsContext = createContext(null);

const FALLBACK = FALLBACK_PAIRS.map((p) => ({
  ...p,
  name: p.name || p.displayPair.split('/')[0],
  baseAsset: p.baseAsset || p.displayPair.split('/')[0],
  coingeckoId: p.coingeckoId || '',
  quoteAsset: p.quoteAsset || (p.symbol.endsWith('INR') ? 'INR' : 'USDT'),
  category: p.category || (p.symbol.endsWith('INR') ? 'commodity' : 'crypto'),
  priceSource: p.category === 'commodity' || p.symbol.endsWith('INR') ? 'commodity_inr' : 'binance',
  unit: p.unit || (p.symbol.endsWith('INR') ? 'g' : ''),
  isActive: true,
}));

function normalizePairs(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((p) => p && p.symbol && p.isActive !== false)
    .map((p) => ({
      ...p,
      symbol: String(p.symbol).toUpperCase(),
      baseAsset: p.baseAsset || String(p.symbol).replace(/USDT$|INR$/i, ''),
      quoteAsset: p.quoteAsset || (String(p.symbol).endsWith('INR') ? 'INR' : 'USDT'),
      displayPair: p.displayPair || `${String(p.symbol).replace(/USDT$/, '/USDT').replace(/INR$/, '/INR')}`,
      name: p.name || p.baseAsset || String(p.symbol).replace(/USDT$|INR$/i, ''),
      isActive: p.isActive !== false,
    }));
}

function initialPairs() {
  const cached = normalizePairs(readCachedPairs());
  return cached.length ? cached : FALLBACK;
}

export function TradingPairsProvider({ children }) {
  const [pairs, setPairs] = useState(initialPairs);
  // Cache/fallback already paints UI — don't block first render
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/market/pairs', { timeout: 8_000 });
      const payload = parseApiResponse(data);
      const rows = normalizePairs(
        Array.isArray(payload?.pairs) ? payload.pairs : Array.isArray(payload) ? payload : []
      );
      if (rows.length) {
        setPairs(rows);
        writeCachedPairs(rows);
      }
    } catch {
      /* keep fallback/cached */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    const onUpdate = () => {
      clearCachedPairs();
      load();
    };
    const onFocus = () => load();
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('trading-pairs:updated', onUpdate);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('trading-pairs:updated', onUpdate);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const symbols = useMemo(() => pairs.map((p) => p.symbol), [pairs]);

  const value = useMemo(
    () => ({
      pairs,
      symbols,
      loading,
      refresh: load,
    }),
    [pairs, symbols, loading, load]
  );

  return <TradingPairsContext.Provider value={value}>{children}</TradingPairsContext.Provider>;
}

export function useTradingPairs() {
  const ctx = useContext(TradingPairsContext);
  if (!ctx) {
    throw new Error('useTradingPairs must be used within TradingPairsProvider');
  }
  return ctx;
}
