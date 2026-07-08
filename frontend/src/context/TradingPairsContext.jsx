import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, parseApiResponse } from '../api/client.js';
import { TRADING_PAIRS as FALLBACK_PAIRS } from '../config/tradingPairs.js';

const TradingPairsContext = createContext(null);

const FALLBACK = FALLBACK_PAIRS.map((p) => ({
  ...p,
  name: p.displayPair.split('/')[0],
  baseAsset: p.displayPair.split('/')[0],
  priceSource: 'binance',
  isActive: true,
}));

export function TradingPairsProvider({ children }) {
  const [pairs, setPairs] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/market/pairs');
      const payload = parseApiResponse(data);
      const rows = Array.isArray(payload?.pairs) ? payload.pairs : Array.isArray(payload) ? payload : [];
      if (rows.length) setPairs(rows);
    } catch {
      /* keep fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    const onUpdate = () => load();
    window.addEventListener('trading-pairs:updated', onUpdate);
    return () => {
      clearInterval(id);
      window.removeEventListener('trading-pairs:updated', onUpdate);
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
