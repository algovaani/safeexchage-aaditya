import { useCallback, useEffect, useState } from 'react';
import { api, parseApiResponse } from '../../api/client.js';
import { useDialog } from '../../context/DialogContext.jsx';

const EMPTY = {
  enabled: true,
  maxLeverage: 125,
  minLeverage: 1,
  defaultLeverage: 20,
  defaultMarginMode: 'cross',
  takerFeeRate: 0.0004,
  makerFeeRate: 0.0002,
  maintenanceMarginRate: 0.004,
  minOrderNotional: 5,
  maxOrderNotional: 5000000,
  minQuantity: 0.001,
  fundingEnabled: false,
  fundingRate: 0.0001,
  allowedLeverages: '1,2,3,5,10,20,25,50,75,100,125',
};

function fmtUsdt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

export default function FuturesAdminSection({ refreshKey = 0 }) {
  const dialog = useDialog();
  const [overview, setOverview] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [positions, setPositions] = useState([]);
  const [posStatus, setPosStatus] = useState('open');
  const [posRefresh, setPosRefresh] = useState(0);

  const loadOverview = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/futures/overview');
      setOverview(parseApiResponse(data));
    } catch {
      setOverview(null);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/futures/settings');
      const s = parseApiResponse(data);
      setForm({
        enabled: s.enabled ?? true,
        maxLeverage: s.maxLeverage ?? 125,
        minLeverage: s.minLeverage ?? 1,
        defaultLeverage: s.defaultLeverage ?? 20,
        defaultMarginMode: s.defaultMarginMode ?? 'cross',
        takerFeeRate: s.takerFeeRate ?? 0.0004,
        makerFeeRate: s.makerFeeRate ?? 0.0002,
        maintenanceMarginRate: s.maintenanceMarginRate ?? 0.004,
        minOrderNotional: s.minOrderNotional ?? 5,
        maxOrderNotional: s.maxOrderNotional ?? 5000000,
        minQuantity: s.minQuantity ?? 0.001,
        fundingEnabled: s.fundingEnabled ?? false,
        fundingRate: s.fundingRate ?? 0.0001,
        allowedLeverages: (s.allowedLeverages || []).join(','),
      });
    } catch {
      setForm(EMPTY);
    }
  }, []);

  const loadPositions = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/futures/positions', { params: { status: posStatus, limit: 100 } });
      setPositions(parseApiResponse(data)?.items || []);
    } catch {
      setPositions([]);
    }
  }, [posStatus]);

  useEffect(() => {
    loadOverview();
    loadSettings();
  }, [loadOverview, loadSettings, refreshKey]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions, posRefresh, posStatus]);

  async function saveSettings(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const allowedLeverages = form.allowedLeverages
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => x >= 1 && x <= 125);
      await api.put('/admin/futures/settings', {
        enabled: form.enabled,
        maxLeverage: Number(form.maxLeverage),
        minLeverage: Number(form.minLeverage),
        defaultLeverage: Number(form.defaultLeverage),
        defaultMarginMode: form.defaultMarginMode,
        takerFeeRate: Number(form.takerFeeRate),
        makerFeeRate: Number(form.makerFeeRate),
        maintenanceMarginRate: Number(form.maintenanceMarginRate),
        minOrderNotional: Number(form.minOrderNotional),
        maxOrderNotional: Number(form.maxOrderNotional),
        minQuantity: Number(form.minQuantity),
        fundingEnabled: form.fundingEnabled,
        fundingRate: Number(form.fundingRate),
        allowedLeverages,
      });
      await loadOverview();
      await loadSettings();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function forceClose(id) {
    const ok = await dialog.confirm({
      title: 'Force close position',
      message: 'Force close this position at market price?',
      confirmLabel: 'Force close',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/admin/futures/positions/${id}/force-close`);
      setPosRefresh((v) => v + 1);
      await loadOverview();
    } catch {
      /* toast */
    }
  }

  return (
    <div className="admin-section-stack">
      <div className="admin-hero-stats">
        <div className="admin-stat-card">
          <span>Module Status</span>
          <strong>{overview?.enabled ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Open Positions</span>
          <strong>{overview?.openPositions ?? '—'}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Liquidations (24h)</span>
          <strong>{overview?.liquidations24h ?? '—'}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Max Leverage</span>
          <strong>{overview?.maxLeverage ?? '—'}x</strong>
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel__head">
          <h2>Futures Settings</h2>
          <p>Control fees, leverage limits, margin rules, and enable/disable the futures module.</p>
        </div>
        <form className="admin-form-grid" onSubmit={saveSettings}>
          <label className="admin-checkbox-row">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enable futures trading
          </label>
          <label>
            Max leverage
            <input className="admin-input" type="number" min={1} max={125} value={form.maxLeverage} onChange={(e) => setForm({ ...form, maxLeverage: e.target.value })} />
          </label>
          <label>
            Min leverage
            <input className="admin-input" type="number" min={1} max={125} value={form.minLeverage} onChange={(e) => setForm({ ...form, minLeverage: e.target.value })} />
          </label>
          <label>
            Default leverage
            <input className="admin-input" type="number" min={1} max={125} value={form.defaultLeverage} onChange={(e) => setForm({ ...form, defaultLeverage: e.target.value })} />
          </label>
          <label>
            Default margin mode
            <select className="admin-input" value={form.defaultMarginMode} onChange={(e) => setForm({ ...form, defaultMarginMode: e.target.value })}>
              <option value="cross">Cross</option>
              <option value="isolated">Isolated</option>
            </select>
          </label>
          <label>
            Taker fee rate
            <input className="admin-input" type="number" step="0.0001" value={form.takerFeeRate} onChange={(e) => setForm({ ...form, takerFeeRate: e.target.value })} />
          </label>
          <label>
            Maker fee rate
            <input className="admin-input" type="number" step="0.0001" value={form.makerFeeRate} onChange={(e) => setForm({ ...form, makerFeeRate: e.target.value })} />
          </label>
          <label>
            Maintenance margin rate
            <input className="admin-input" type="number" step="0.0001" value={form.maintenanceMarginRate} onChange={(e) => setForm({ ...form, maintenanceMarginRate: e.target.value })} />
          </label>
          <label>
            Min order notional (USDT)
            <input className="admin-input" type="number" value={form.minOrderNotional} onChange={(e) => setForm({ ...form, minOrderNotional: e.target.value })} />
          </label>
          <label>
            Max order notional (USDT)
            <input className="admin-input" type="number" value={form.maxOrderNotional} onChange={(e) => setForm({ ...form, maxOrderNotional: e.target.value })} />
          </label>
          <label>
            Min quantity
            <input className="admin-input" type="number" step="0.0001" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
          </label>
          <label>
            Allowed leverages (comma-separated)
            <input className="admin-input" value={form.allowedLeverages} onChange={(e) => setForm({ ...form, allowedLeverages: e.target.value })} />
          </label>
          <label className="admin-checkbox-row">
            <input type="checkbox" checked={form.fundingEnabled} onChange={(e) => setForm({ ...form, fundingEnabled: e.target.checked })} />
            Enable funding fee (display only for now)
          </label>
          <label>
            Funding rate
            <input className="admin-input" type="number" step="0.0001" value={form.fundingRate} onChange={(e) => setForm({ ...form, fundingRate: e.target.value })} />
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>

      <div className="admin-panel">
        <div className="admin-panel__head admin-panel__head--row">
          <div>
            <h2>Open Positions</h2>
            <p>Monitor and force-close user futures positions.</p>
          </div>
          <select className="admin-input admin-input--compact" value={posStatus} onChange={(e) => setPosStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="liquidated">Liquidated</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Lev</th>
                <th>Margin</th>
                <th>uPnL</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {positions.map((r) => (
                <tr key={r.id}>
                  <td>{r.user?.email || '—'}</td>
                  <td>{r.symbol}</td>
                  <td>{r.side}</td>
                  <td>{Number(r.quantity).toFixed(4)}</td>
                  <td>{r.leverage}x</td>
                  <td>{fmtUsdt(r.margin)}</td>
                  <td>{fmtUsdt(r.unrealizedPnl)}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.status === 'open' ? (
                      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => forceClose(r.id)}>
                        Force close
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!positions.length && (
                <tr>
                  <td colSpan={9} className="admin-empty">
                    No positions found.
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
