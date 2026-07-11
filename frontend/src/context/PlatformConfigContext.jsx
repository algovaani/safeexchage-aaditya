import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, parseApiResponse } from '../api/client.js';
import { readCachedConfig, writeCachedConfig } from '../utils/configCache.js';
import { fmtINR, inrFromUsdt } from '../utils/format.js';

const DEFAULT_RATE = 83.5;

const PlatformConfigContext = createContext(null);

export function PlatformConfigProvider({ children }) {
  const cached = readCachedConfig();
  const [usdtInrRate, setUsdtInrRate] = useState(
    Number(cached?.usdt_inr_rate) > 0 ? Number(cached.usdt_inr_rate) : DEFAULT_RATE
  );
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/config');
      const payload = parseApiResponse(data);
      writeCachedConfig(payload);
      const rate = Number(payload?.usdt_inr_rate);
      if (Number.isFinite(rate) && rate >= 1) {
        setUsdtInrRate(rate);
      }
    } catch {
      /* keep cached/default rate */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60_000);
    const onUpdate = () => load();
    window.addEventListener('platform:config-updated', onUpdate);
    return () => {
      clearInterval(id);
      window.removeEventListener('platform:config-updated', onUpdate);
    };
  }, [load]);

  const toInr = useCallback((usdt) => inrFromUsdt(usdt, usdtInrRate), [usdtInrRate]);

  const fmtBalance = useCallback(
    (usdt, { showUsdt = true } = {}) => {
      const inr = fmtINR(toInr(usdt));
      if (!showUsdt) return inr;
      const usdtVal = Number(usdt);
      const usdtStr = Number.isFinite(usdtVal)
        ? `${usdtVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
        : '— USDT';
      return { inr, usdt: usdtStr, primary: inr, secondary: `≈ ${usdtStr}` };
    },
    [toInr]
  );

  const value = useMemo(
    () => ({
      usdtInrRate,
      loading,
      toInr,
      fmtBalance,
      refresh: load,
    }),
    [usdtInrRate, loading, toInr, fmtBalance, load]
  );

  return <PlatformConfigContext.Provider value={value}>{children}</PlatformConfigContext.Provider>;
}

export function usePlatformConfig() {
  const ctx = useContext(PlatformConfigContext);
  if (!ctx) {
    throw new Error('usePlatformConfig must be used within PlatformConfigProvider');
  }
  return ctx;
}
