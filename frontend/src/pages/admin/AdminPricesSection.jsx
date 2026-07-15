import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { api, parseApiResponse } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useTradingPairs } from '../../context/TradingPairsContext.jsx';
import { CoinLabel } from '../../components/CoinIcon.jsx';
import { LIST_MARKET_POLL_MS } from '../../config/marketPoll.js';

function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export default function AdminPricesSection() {
  const toast = useToast();
  const { pairs } = useTradingPairs();
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pulseInputs, setPulseInputs] = useState({});
  const [busySymbol, setBusySymbol] = useState('');
  const [manual, setManual] = useState([]);
  const [search, setSearch] = useState('');

  const pairBySymbol = useMemo(() => {
    const map = new Map();
    for (const p of pairs || []) map.set(String(p.symbol).toUpperCase(), p);
    return map;
  }, [pairs]);

  const loadPrices = useCallback(async () => {
    try {
      const { data } = await api.get('/market/prices/live');
      const payload = parseApiResponse(data);
      const rows = Array.isArray(payload?.pairs)
        ? payload.pairs
        : Array.isArray(payload?.prices)
          ? payload.prices
          : Array.isArray(payload)
            ? payload
            : [];
      setPrices(rows);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadManual = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/manual-prices');
      setManual(asArray(parseApiResponse(data)));
    } catch {
      setManual([]);
    }
  }, []);

  useEffect(() => {
    loadPrices();
    loadManual();
    const id = setInterval(loadPrices, LIST_MARKET_POLL_MS);
    return () => clearInterval(id);
  }, [loadPrices, loadManual]);

  const rows = useMemo(() => {
    const bySym = new Map();
    for (const p of prices) {
      const sym = String(p.symbol || p.pair || '').toUpperCase();
      if (!sym) continue;
      bySym.set(sym, p);
    }

    const list = (pairs || []).map((pair) => {
      const sym = String(pair.symbol).toUpperCase();
      const live = bySym.get(sym) || {};
      const price = Number(live.price ?? live.lastPrice ?? live.price_inr ?? 0);
      return {
        symbol: sym,
        displayPair: pair.displayPair || sym,
        name: pair.name || pair.baseAsset || sym,
        imageUrl: pair.imageUrl,
        coingeckoId: pair.coingeckoId,
        type: pair.category === 'commodity' || sym.endsWith('INR') ? 'commodity' : 'crypto',
        price,
        change: Number(live.change_24h ?? live.priceChangePercent ?? 0),
      };
    });

    // Include any live symbols missing from pairs config
    for (const [sym, live] of bySym) {
      if (list.some((r) => r.symbol === sym)) continue;
      list.push({
        symbol: sym,
        displayPair: sym,
        name: sym.replace(/USDT$|INR$/, ''),
        imageUrl: null,
        coingeckoId: '',
        type: sym.endsWith('INR') ? 'commodity' : 'crypto',
        price: Number(live.price ?? live.lastPrice ?? 0),
        change: Number(live.change_24h ?? live.priceChangePercent ?? 0),
      });
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q) ||
        r.displayPair.toLowerCase().includes(q) ||
        String(r.name || '')
          .toLowerCase()
          .includes(q)
    );
  }, [pairs, prices, search]);

  async function runPulse(row) {
    const raw = pulseInputs[row.symbol];
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid pulse price');
      return;
    }
    setBusySymbol(row.symbol);
    try {
      const { data } = await api.post('/admin/prices/pulse', {
        symbol: row.symbol,
        price,
        holdMs: 2500,
      });
      const payload = parseApiResponse(data);
      const filled = payload?.filledOrders ?? 0;
      toast.success(
        filled
          ? `${row.displayPair} → ${fmtPrice(price)} · ${filled} order(s) filled`
          : `${row.displayPair} pulsed to ${fmtPrice(price)} · chart spiked & will revert`
      );
      await loadPrices();
    } catch (ex) {
      toast.error(ex?.response?.data?.message || ex.message || 'Pulse failed');
    } finally {
      setBusySymbol('');
    }
  }

  return (
    <div className="admin-prices">
      <div className="admin-card">
        <div className="admin-prices__head">
          <div>
            <h2>Live prices &amp; order pulse</h2>
            <p className="admin-muted" style={{ margin: '0.35rem 0 0' }}>
              Enter a price to spike the chart once, fill limit orders in that range, then revert to
              market.
            </p>
          </div>
          <input
            className="admin-input"
            style={{ maxWidth: 220 }}
            placeholder="Search coin…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table admin-prices__table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Live price</th>
                <th>24h</th>
                <th>Pulse price</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    <Loader2 className="spin" size={18} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                    Loading prices…
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const busy = busySymbol === row.symbol;
                const change = Number(row.change);
                return (
                  <tr key={row.symbol}>
                    <td>
                      <CoinLabel
                        symbol={row.symbol.replace(/USDT$|INR$/, '')}
                        imageUrl={row.imageUrl}
                        coingeckoId={row.coingeckoId}
                        type={row.type}
                        name={row.name}
                        label={row.displayPair}
                        sub={row.name}
                        size={28}
                      />
                    </td>
                    <td className="tabular-nums">{fmtPrice(row.price)}</td>
                    <td
                      className={`tabular-nums ${
                        change > 0 ? 'text-profit' : change < 0 ? 'text-loss' : ''
                      }`}
                    >
                      {Number.isFinite(change) && change !== 0
                        ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%`
                        : '—'}
                    </td>
                    <td>
                      <input
                        className="admin-input admin-prices__pulse-input"
                        type="number"
                        step="any"
                        min="0"
                        placeholder={row.price ? String(row.price) : 'Target price'}
                        value={pulseInputs[row.symbol] ?? ''}
                        onChange={(e) =>
                          setPulseInputs((prev) => ({ ...prev, [row.symbol]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') runPulse(row);
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary admin-btn--sm"
                        disabled={busy}
                        onClick={() => runPulse(row)}
                      >
                        {busy ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <>
                            <Zap size={14} /> Pulse
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    No trading pairs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card">
        <h2>Manual candle overrides</h2>
        <p className="admin-muted" style={{ marginTop: 0 }}>
          Legacy merge-layer candles (chart only). Prefer Pulse above to fill orders.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Interval</th>
                <th>Open time</th>
                <th>Close</th>
              </tr>
            </thead>
            <tbody>
              {manual.slice(0, 50).map((m) => {
                const meta = pairBySymbol.get(String(m.symbol).toUpperCase());
                const base = String(m.symbol || '').replace(/USDT$|INR$/, '');
                return (
                  <tr key={m._id}>
                    <td>
                      <CoinLabel
                        symbol={base}
                        imageUrl={meta?.imageUrl}
                        coingeckoId={meta?.coingeckoId}
                        type={meta?.category === 'commodity' ? 'commodity' : 'crypto'}
                        name={meta?.name}
                        label={meta?.displayPair || m.symbol}
                        size={22}
                      />
                    </td>
                    <td>{m.interval}</td>
                    <td>{m.openTime}</td>
                    <td>{m.close ?? m.price}</td>
                  </tr>
                );
              })}
              {!manual.length && (
                <tr>
                  <td colSpan={4} className="admin-empty">
                    No manual overrides.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}
