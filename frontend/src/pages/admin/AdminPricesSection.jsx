import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { Loader2, Pencil, Trash2, Zap } from 'lucide-react';
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

function emptyStatsForm() {
  return {
    change_24h: '',
    high_24h: '',
    low_24h: '',
    quoteVolume: '',
    volume: '',
  };
}

function formFromOverride(ov, live) {
  return {
    change_24h:
      ov?.change_24h != null
        ? String(ov.change_24h)
        : live?.change != null
          ? String(live.change)
          : '',
    high_24h:
      ov?.high_24h != null
        ? String(ov.high_24h)
        : live?.high != null
          ? String(live.high)
          : '',
    low_24h:
      ov?.low_24h != null ? String(ov.low_24h) : live?.low != null ? String(live.low) : '',
    quoteVolume:
      ov?.quoteVolume != null
        ? String(ov.quoteVolume)
        : live?.quoteVolume != null
          ? String(live.quoteVolume)
          : '',
    volume:
      ov?.volume != null ? String(ov.volume) : live?.volume != null ? String(live.volume) : '',
  };
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
  const [overrides, setOverrides] = useState({});
  const [editSymbol, setEditSymbol] = useState('');
  const [statsForm, setStatsForm] = useState(emptyStatsForm());
  const [statsBusy, setStatsBusy] = useState(false);

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

  const loadOverrides = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/ticker-stats');
      const rows = asArray(parseApiResponse(data));
      const map = {};
      for (const row of rows) {
        map[String(row.symbol).toUpperCase()] = row;
      }
      setOverrides(map);
    } catch {
      setOverrides({});
    }
  }, []);

  useEffect(() => {
    loadPrices();
    loadManual();
    loadOverrides();
    const id = setInterval(loadPrices, LIST_MARKET_POLL_MS);
    return () => clearInterval(id);
  }, [loadPrices, loadManual, loadOverrides]);

  const rows = useMemo(() => {
    const bySym = new Map();
    for (const p of prices) {
      const sym = String(p.symbol || p.pair || '').toUpperCase();
      if (!sym) continue;
      bySym.set(sym, p);
    }

    const list = (pairs || [])
      .filter((pair) => {
        const sym = String(pair.symbol || '').toUpperCase();
        return (
          pair.isActive !== false &&
          pair.category !== 'commodity' &&
          !sym.endsWith('INR') &&
          sym !== 'GOLDINR' &&
          sym !== 'SILVERINR'
        );
      })
      .map((pair) => {
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
        high: Number(live.high_24h ?? live.highPrice ?? 0) || null,
        low: Number(live.low_24h ?? live.lowPrice ?? 0) || null,
        volume: Number(live.volume ?? 0) || null,
        quoteVolume: Number(live.quoteVolume ?? 0) || null,
        statsOverride: Boolean(live.stats_override) || Boolean(overrides[sym]),
        override: overrides[sym] || null,
      };
    });

    for (const [sym, live] of bySym) {
      if (sym.endsWith('INR') || sym === 'GOLDINR' || sym === 'SILVERINR') continue;
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
        high: Number(live.high_24h ?? 0) || null,
        low: Number(live.low_24h ?? 0) || null,
        volume: Number(live.volume ?? 0) || null,
        quoteVolume: Number(live.quoteVolume ?? 0) || null,
        statsOverride: Boolean(live.stats_override) || Boolean(overrides[sym]),
        override: overrides[sym] || null,
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
  }, [pairs, prices, search, overrides]);

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
        holdMs: 4500,
      });
      const payload = parseApiResponse(data);
      const filled = payload?.filledOrders ?? 0;
      toast.success(
        filled
          ? `${row.displayPair} → ${fmtPrice(price)} · ${filled} order(s) filled · returns to Binance`
          : `${row.displayPair} pulsed at ${fmtPrice(price)} · live spike · returns to Binance`
      );
      await Promise.all([loadPrices(), loadManual()]);
    } catch (ex) {
      toast.error(ex?.response?.data?.message || ex.message || 'Pulse failed');
    } finally {
      setBusySymbol('');
    }
  }

  function openStatsEditor(row) {
    setEditSymbol(row.symbol);
    setStatsForm(formFromOverride(row.override, row));
  }

  function closeStatsEditor() {
    setEditSymbol('');
    setStatsForm(emptyStatsForm());
  }

  async function saveStats(row) {
    setStatsBusy(true);
    try {
      await api.put(`/admin/ticker-stats/${encodeURIComponent(row.symbol)}`, {
        change_24h: statsForm.change_24h === '' ? null : Number(statsForm.change_24h),
        high_24h: statsForm.high_24h === '' ? null : Number(statsForm.high_24h),
        low_24h: statsForm.low_24h === '' ? null : Number(statsForm.low_24h),
        quoteVolume: statsForm.quoteVolume === '' ? null : Number(statsForm.quoteVolume),
        volume: statsForm.volume === '' ? null : Number(statsForm.volume),
        enabled: true,
      });
      toast.success(`${row.displayPair} ticker stats updated`);
      closeStatsEditor();
      await Promise.all([loadOverrides(), loadPrices()]);
    } catch (ex) {
      toast.error(ex?.response?.data?.message || ex.message || 'Failed to save stats');
    } finally {
      setStatsBusy(false);
    }
  }

  async function clearStats(row) {
    setStatsBusy(true);
    try {
      await api.delete(`/admin/ticker-stats/${encodeURIComponent(row.symbol)}`);
      toast.success(`${row.displayPair} ticker override cleared`);
      if (editSymbol === row.symbol) closeStatsEditor();
      await Promise.all([loadOverrides(), loadPrices()]);
    } catch (ex) {
      toast.error(ex?.response?.data?.message || ex.message || 'Failed to clear override');
    } finally {
      setStatsBusy(false);
    }
  }

  return (
    <div className="admin-prices">
      <div className="admin-card">
        <div className="admin-prices__head">
          <div>
            <h2>Live prices, pulse &amp; ticker stats</h2>
            <p className="admin-muted" style={{ margin: '0.35rem 0 0' }}>
              Pulse spikes last price on the chart. Use <strong>Edit stats</strong> to set the
              trading header values: 24h Change, High, Low, and Volume (USDT).
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
                <th>24h %</th>
                <th>High</th>
                <th>Low</th>
                <th>Vol (USDT)</th>
                <th>Pulse price</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr>
                  <td colSpan={8} className="admin-empty">
                    <Loader2 className="spin" size={18} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                    Loading prices…
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const busy = busySymbol === row.symbol;
                const change = Number(row.change);
                const editing = editSymbol === row.symbol;
                return (
                  <Fragment key={row.symbol}>
                    <tr>
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
                        {row.statsOverride ? (
                          <span className="admin-prices__override-badge">Override</span>
                        ) : null}
                      </td>
                      <td className="tabular-nums">{fmtPrice(row.price)}</td>
                      <td
                        className={`tabular-nums ${
                          change > 0 ? 'text-profit' : change < 0 ? 'text-loss' : ''
                        }`}
                      >
                        {Number.isFinite(change)
                          ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%`
                          : '—'}
                      </td>
                      <td className="tabular-nums">{fmtPrice(row.high)}</td>
                      <td className="tabular-nums">{fmtPrice(row.low)}</td>
                      <td className="tabular-nums">
                        {row.quoteVolume != null && Number.isFinite(row.quoteVolume)
                          ? row.quoteVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })
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
                        <div className="admin-actions">
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
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            onClick={() => (editing ? closeStatsEditor() : openStatsEditor(row))}
                          >
                            <Pencil size={14} /> {editing ? 'Close' : 'Edit stats'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editing ? (
                      <tr className="admin-prices__stats-row">
                        <td colSpan={8}>
                          <div className="admin-prices__stats-form">
                            <label>
                              24h Change %
                              <input
                                className="admin-input"
                                type="number"
                                step="any"
                                placeholder="e.g. 2.5 or -1.2"
                                value={statsForm.change_24h}
                                onChange={(e) =>
                                  setStatsForm((f) => ({ ...f, change_24h: e.target.value }))
                                }
                              />
                            </label>
                            <label>
                              24h High
                              <input
                                className="admin-input"
                                type="number"
                                step="any"
                                min="0"
                                value={statsForm.high_24h}
                                onChange={(e) =>
                                  setStatsForm((f) => ({ ...f, high_24h: e.target.value }))
                                }
                              />
                            </label>
                            <label>
                              24h Low
                              <input
                                className="admin-input"
                                type="number"
                                step="any"
                                min="0"
                                value={statsForm.low_24h}
                                onChange={(e) =>
                                  setStatsForm((f) => ({ ...f, low_24h: e.target.value }))
                                }
                              />
                            </label>
                            <label>
                              24h Volume (USDT)
                              <input
                                className="admin-input"
                                type="number"
                                step="any"
                                min="0"
                                value={statsForm.quoteVolume}
                                onChange={(e) =>
                                  setStatsForm((f) => ({ ...f, quoteVolume: e.target.value }))
                                }
                              />
                            </label>
                            <label>
                              Base volume (optional)
                              <input
                                className="admin-input"
                                type="number"
                                step="any"
                                min="0"
                                value={statsForm.volume}
                                onChange={(e) =>
                                  setStatsForm((f) => ({ ...f, volume: e.target.value }))
                                }
                              />
                            </label>
                            <div className="admin-prices__stats-actions">
                              <button
                                type="button"
                                className="admin-btn admin-btn--primary admin-btn--sm"
                                disabled={statsBusy}
                                onClick={() => saveStats(row)}
                              >
                                {statsBusy ? <Loader2 size={14} className="spin" /> : 'Save stats'}
                              </button>
                              {row.override ? (
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--danger admin-btn--sm"
                                  disabled={statsBusy}
                                  onClick={() => clearStats(row)}
                                >
                                  <Trash2 size={14} /> Clear override
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={8} className="admin-empty">
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
          Pulse briefly spikes the chart to fill orders, then restores live market candles so the
          graph keeps updating normally (extreme wick is not kept forever).
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
