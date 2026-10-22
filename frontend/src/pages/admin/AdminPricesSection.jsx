import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { AlertCircle, Loader2, Lock, Pencil, RefreshCw, Trash2, Unlock, X, Zap } from 'lucide-react';
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

  // Candle Fix & Pulse Dialog Modal State
  const [activePulses, setActivePulses] = useState({});
  const [pulseModalRow, setPulseModalRow] = useState(null);
  const [pulseTargetPrice, setPulseTargetPrice] = useState('');
  const [candleFixEnabled, setCandleFixEnabled] = useState(false);
  const [pulseSubmitting, setPulseSubmitting] = useState(false);

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

  const loadPulses = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/prices/pulses');
      const list = asArray(parseApiResponse(data));
      const map = {};
      for (const p of list) {
        if (p?.symbol) map[String(p.symbol).toUpperCase()] = p;
      }
      setActivePulses(map);
    } catch {
      setActivePulses({});
    }
  }, []);

  useEffect(() => {
    loadPrices();
    loadManual();
    loadOverrides();
    loadPulses();
    const id = setInterval(() => {
      loadPrices();
      loadPulses();
    }, LIST_MARKET_POLL_MS);
    return () => clearInterval(id);
  }, [loadPrices, loadManual, loadOverrides, loadPulses]);

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
        const pulseDoc = activePulses[sym];
        const isCandleFixed = Boolean(pair.candleFix || pulseDoc?.candleFix);
        const fixedPrice = pair.candleFixPrice ?? pulseDoc?.price ?? null;
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
          candleFix: isCandleFixed,
          candleFixPrice: fixedPrice,
        };
      });

    for (const [sym, live] of bySym) {
      if (sym.endsWith('INR') || sym === 'GOLDINR' || sym === 'SILVERINR') continue;
      if (list.some((r) => r.symbol === sym)) continue;
      const pair = pairBySymbol.get(sym);
      const pulseDoc = activePulses[sym];
      const isCandleFixed = Boolean(pair?.candleFix || pulseDoc?.candleFix);
      const fixedPrice = pair?.candleFixPrice ?? pulseDoc?.price ?? null;
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
        candleFix: isCandleFixed,
        candleFixPrice: fixedPrice,
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
  }, [pairs, prices, search, overrides, activePulses]);

  function openPulseModal(row) {
    const sym = String(row.symbol).toUpperCase();
    const isFixed = Boolean(row.candleFix);
    const existingFixedPrice = row.candleFixPrice;
    const initialPrice =
      pulseInputs[sym] ||
      (isFixed && existingFixedPrice
        ? String(existingFixedPrice)
        : row.price
        ? String(row.price)
        : '');
    setPulseModalRow(row);
    setPulseTargetPrice(initialPrice);
    setCandleFixEnabled(isFixed);
  }

  async function submitPulseModal() {
    if (!pulseModalRow) return;
    const price = Number(pulseTargetPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid target pulse price');
      return;
    }
    setPulseSubmitting(true);
    try {
      const { data } = await api.post('/admin/prices/pulse', {
        symbol: pulseModalRow.symbol,
        price,
        candleFix: candleFixEnabled,
        holdMs: 4500,
      });
      const payload = parseApiResponse(data);
      if (candleFixEnabled) {
        toast.success(
          `${pulseModalRow.displayPair} candle fixed at ${fmtPrice(price)} (frozen on user chart)`
        );
      } else {
        const filled = payload?.filledOrders ?? 0;
        toast.success(
          filled
            ? `${pulseModalRow.displayPair} → ${fmtPrice(price)} · ${filled} order(s) filled · returns to Binance`
            : `${pulseModalRow.displayPair} pulsed at ${fmtPrice(price)} · live spike · returns to Binance`
        );
      }
      setPulseModalRow(null);
      await Promise.all([loadPrices(), loadPulses(), loadManual()]);
    } catch (ex) {
      toast.error(ex?.response?.data?.message || ex.message || 'Pulse failed');
    } finally {
      setPulseSubmitting(false);
    }
  }

  async function handleStopCandleFix(row) {
    if (!row) return;
    setPulseSubmitting(true);
    try {
      await api.post('/admin/prices/pulse/stop', {
        symbol: row.symbol,
      });
      toast.success(`${row.displayPair} Candle Fix turned OFF · Resumed live market`);
      setPulseModalRow(null);
      await Promise.all([loadPrices(), loadPulses(), loadManual()]);
    } catch (ex) {
      toast.error(ex?.response?.data?.message || ex.message || 'Failed to stop Candle Fix');
    } finally {
      setPulseSubmitting(false);
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
              Pulse spikes last price on the chart and expands 24h High/Low to include the pulse
              extreme. Use <strong>Edit stats</strong> to fine-tune
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
                        {row.candleFix ? (
                          <span
                            className="admin-prices__fixed-badge"
                            title={`Candle frozen at $${fmtPrice(row.candleFixPrice)}`}
                          >
                            <Lock size={11} /> Fixed: ${fmtPrice(row.candleFixPrice)}
                          </span>
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
                          placeholder={
                            row.candleFix
                              ? `Fixed: ${fmtPrice(row.candleFixPrice)}`
                              : row.price
                              ? String(row.price)
                              : 'Target price'
                          }
                          value={pulseInputs[row.symbol] ?? ''}
                          onChange={(e) =>
                            setPulseInputs((prev) => ({ ...prev, [row.symbol]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') openPulseModal(row);
                          }}
                        />
                      </td>
                      <td>
                        <div className="admin-actions">
                          <button
                            type="button"
                            className={`admin-btn ${
                              row.candleFix ? 'admin-btn--warning' : 'admin-btn--primary'
                            } admin-btn--sm`}
                            disabled={busy}
                            onClick={() => openPulseModal(row)}
                            title={
                              row.candleFix
                                ? 'Candle Fix is active. Click to manage or turn off.'
                                : 'Pulse price or fix candle'
                            }
                          >
                            {busy ? (
                              <Loader2 size={14} className="spin" />
                            ) : row.candleFix ? (
                              <>
                                <Lock size={14} /> Fixed
                              </>
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

      {/* Price Pulse & Candle Fix Dialog Modal */}
      {pulseModalRow && (
        <div
          className="admin-pulse-modal-backdrop"
          onClick={() => !pulseSubmitting && setPulseModalRow(null)}
        >
          <div className="admin-pulse-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-pulse-modal__header">
              <div className="admin-pulse-modal__title-box">
                <div className="admin-pulse-modal__icon">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="admin-pulse-modal__title">Price Pulse &amp; Setup</h3>
                  <p className="admin-pulse-modal__subtitle">
                    {pulseModalRow.displayPair} · {pulseModalRow.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="admin-pulse-modal__close"
                disabled={pulseSubmitting}
                onClick={() => setPulseModalRow(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-pulse-modal__body">
              {/* Current Status Card */}
              <div className="admin-pulse-modal__status-card">
                <div className="admin-pulse-modal__status-item">
                  <span className="label">Live Market Price</span>
                  <span className="value tabular-nums">${fmtPrice(pulseModalRow.price)}</span>
                </div>
                <div className="admin-pulse-modal__status-item">
                  <span className="label">Candle Status</span>
                  {pulseModalRow.candleFix ? (
                    <span className="badge badge--locked">
                      <Lock size={12} /> Frozen @ ${fmtPrice(pulseModalRow.candleFixPrice)}
                    </span>
                  ) : (
                    <span className="badge badge--live">
                      <RefreshCw size={12} /> Live Binance Feed
                    </span>
                  )}
                </div>
              </div>

              {/* Target Price Input */}
              <div className="admin-pulse-modal__field">
                <label htmlFor="pulse-target-price">
                  Target Price (USDT) <span className="req">*</span>
                </label>
                <div className="admin-pulse-modal__input-wrapper">
                  <input
                    id="pulse-target-price"
                    type="number"
                    step="any"
                    min="0"
                    className="admin-input"
                    placeholder="Enter target pulse price"
                    value={pulseTargetPrice}
                    onChange={(e) => setPulseTargetPrice(e.target.value)}
                    autoFocus
                  />
                  {pulseModalRow.price ? (
                    <button
                      type="button"
                      className="admin-pulse-modal__fill-btn"
                      onClick={() => setPulseTargetPrice(String(pulseModalRow.price))}
                    >
                      Use Live
                    </button>
                  ) : null}
                </div>
                <span className="admin-pulse-modal__hint">
                  The chart candle will form at this price and wick from ${fmtPrice(pulseModalRow.price)}.
                </span>
              </div>

              {/* Candle Fix Switch Option */}
              <div className="admin-pulse-modal__switch-box">
                <div className="admin-pulse-modal__switch-header">
                  <div className="admin-pulse-modal__switch-label-group">
                    <span className="admin-pulse-modal__switch-title">Candle Fix</span>
                    <span className={`admin-pulse-modal__switch-tag ${candleFixEnabled ? 'on' : 'off'}`}>
                      {candleFixEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={candleFixEnabled}
                    className={`admin-pulse-switch ${candleFixEnabled ? 'admin-pulse-switch--on' : ''}`}
                    onClick={() => setCandleFixEnabled(!candleFixEnabled)}
                    disabled={pulseSubmitting}
                  >
                    <span className="admin-pulse-switch__thumb" />
                  </button>
                </div>

                <div className="admin-pulse-modal__switch-desc">
                  {candleFixEnabled ? (
                    <div className="desc-box desc-box--on">
                      <Lock size={15} />
                      <p>
                        <strong>Candle Fix is ON:</strong> Candle will stop and freeze at this fixed price on the
                        user trade page. It will <strong>NOT move with the live market</strong> until you turn Candle
                        Fix OFF.
                      </p>
                    </div>
                  ) : (
                    <div className="desc-box desc-box--off">
                      <Zap size={15} />
                      <p>
                        <strong>Candle Fix is OFF:</strong> One-time momentary spike on the chart (4.5s) to trigger
                        limit orders, then automatically returns to live market price.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* If Candle Fix is currently ACTIVE on this coin, show Turn OFF button */}
              {pulseModalRow.candleFix ? (
                <div className="admin-pulse-modal__active-alert">
                  <div className="alert-content">
                    <AlertCircle size={16} />
                    <span>
                      Candle Fix is currently <strong>ACTIVE</strong> on {pulseModalRow.displayPair}. User charts are
                      frozen at <strong>${fmtPrice(pulseModalRow.candleFixPrice)}</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger admin-btn--sm"
                    disabled={pulseSubmitting}
                    onClick={() => handleStopCandleFix(pulseModalRow)}
                  >
                    {pulseSubmitting ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <>
                        <Unlock size={14} /> Turn OFF Candle Fix &amp; Resume Live Market
                      </>
                    )}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="admin-pulse-modal__footer">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={pulseSubmitting}
                onClick={() => setPulseModalRow(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`admin-btn ${candleFixEnabled ? 'admin-btn--warning' : 'admin-btn--primary'}`}
                disabled={pulseSubmitting}
                onClick={submitPulseModal}
              >
                {pulseSubmitting ? (
                  <Loader2 size={15} className="spin" />
                ) : candleFixEnabled ? (
                  <>
                    <Lock size={15} /> {pulseModalRow.candleFix ? 'Update Fixed Price' : 'Apply & Freeze Candle (ON)'}
                  </>
                ) : (
                  <>
                    <Zap size={15} /> Execute Pulse (Spike &amp; Revert)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}
