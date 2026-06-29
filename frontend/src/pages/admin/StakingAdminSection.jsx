import { useCallback, useEffect, useState } from 'react';
import { api, parseApiResponse } from '../../api/client.js';
import AdminDataTable from '../../components/AdminDataTable.jsx';

const EMPTY_PLAN = {
  name: '',
  roi_percent: '',
  lock_days: '30',
  min_amount: '',
  max_amount: '',
  payout_type: 'end_of_plan',
  payout_mode: 'auto',
  requires_approval: false,
};

function usdt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

export default function StakingAdminSection({ refreshKey = 0, onMutate }) {
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [planBusy, setPlanBusy] = useState(false);
  const [stakesRefresh, setStakesRefresh] = useState(0);

  const loadPlans = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/staking/plans');
      setPlans(parseApiResponse(data) || []);
    } catch {
      setPlans([]);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans, refreshKey]);

  async function createPlan(e) {
    e.preventDefault();
    setPlanBusy(true);
    try {
      const body = {
        name: planForm.name.trim(),
        roi_percent: Number(planForm.roi_percent),
        lock_days: Number(planForm.lock_days),
        min_amount: Number(planForm.min_amount),
        max_amount: Number(planForm.max_amount),
        payout_type: planForm.payout_type,
        payout_mode: planForm.payout_mode,
        requires_approval: planForm.requires_approval,
      };
      await api.post('/admin/staking/plans', body);
      setPlanForm(EMPTY_PLAN);
      await loadPlans();
      onMutate?.();
    } catch {
      /* toast */
    } finally {
      setPlanBusy(false);
    }
  }

  async function togglePlan(plan) {
    await api.patch(`/admin/staking/plans/${plan.id}`, { is_active: !plan.is_active });
    await loadPlans();
    onMutate?.();
  }

  async function reviewStake(id, action) {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Rejection note (optional):') || '';
    }
    await api.patch(`/admin/staking/stakes/${id}/review`, { action, note });
    setStakesRefresh((k) => k + 1);
    onMutate?.();
  }

  async function releasePayout(id) {
    if (!window.confirm('Release maturity payout to user wallet?')) return;
    await api.post(`/admin/staking/stakes/${id}/release-payout`);
    setStakesRefresh((k) => k + 1);
    onMutate?.();
  }

  const stakeColumns = [
    { key: 'user_email', label: 'User' },
    { key: 'plan_name', label: 'Plan' },
    {
      key: 'amount',
      label: 'Investment',
      render: (row) => usdt(row.amount),
    },
    {
      key: 'profit',
      label: 'Profit',
      render: (row) => usdt(row.profit),
    },
    {
      key: 'maturity_amount',
      label: 'Maturity',
      render: (row) => usdt(row.maturity_amount),
    },
    { key: 'status', label: 'Status' },
    {
      key: 'payout_mode',
      label: 'Payout',
      render: (row) => `${row.payout_type || 'end_of_plan'} · ${row.payout_mode || 'auto'}`,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        <div className="admin-row-actions">
          {row.status === 'pending' && (
            <>
              <button type="button" className="admin-btn admin-btn--primary admin-btn--xs" onClick={() => reviewStake(row.id, 'approve')}>
                Approve
              </button>
              <button type="button" className="admin-btn admin-btn--ghost admin-btn--xs" onClick={() => reviewStake(row.id, 'reject')}>
                Reject
              </button>
            </>
          )}
          {row.is_matured && !row.payout_released && row.status !== 'withdrawn' && row.status !== 'rejected' && (
            <button type="button" className="admin-btn admin-btn--primary admin-btn--xs" onClick={() => releasePayout(row.id)}>
              Release payout
            </button>
          )}
        </div>
      ),
    },
  ];

  const stakeFilters = [
    {
      key: 'status',
      label: 'All statuses',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'active', label: 'Active' },
        { value: 'matured', label: 'Matured' },
        { value: 'withdrawn', label: 'Withdrawn' },
        { value: 'rejected', label: 'Rejected' },
      ],
    },
  ];

  return (
    <>
      <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Create USDT investment plans with fixed-period ROI. Approve pending investments, enable or disable
        plans, and release maturity payouts manually when payout mode is manual.
      </p>

      <div className="admin-card" style={{ marginBottom: '1.25rem' }}>
        <h2>Create investment plan</h2>
        <form className="admin-form-grid" onSubmit={createPlan}>
          <div className="admin-field">
            <label>Plan name</label>
            <input
              value={planForm.name}
              onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Silver"
              required
            />
          </div>
          <div className="admin-field">
            <label>ROI % (full period)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={planForm.roi_percent}
              onChange={(e) => setPlanForm((f) => ({ ...f, roi_percent: e.target.value }))}
              placeholder="15"
              required
            />
          </div>
          <div className="admin-field">
            <label>Duration (days)</label>
            <input
              type="number"
              min="1"
              value={planForm.lock_days}
              onChange={(e) => setPlanForm((f) => ({ ...f, lock_days: e.target.value }))}
              required
            />
          </div>
          <div className="admin-field">
            <label>Min investment (USDT)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={planForm.min_amount}
              onChange={(e) => setPlanForm((f) => ({ ...f, min_amount: e.target.value }))}
              required
            />
          </div>
          <div className="admin-field">
            <label>Max investment (USDT)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={planForm.max_amount}
              onChange={(e) => setPlanForm((f) => ({ ...f, max_amount: e.target.value }))}
              required
            />
          </div>
          <div className="admin-field">
            <label>Payout type</label>
            <select
              value={planForm.payout_type}
              onChange={(e) => setPlanForm((f) => ({ ...f, payout_type: e.target.value }))}
            >
              <option value="end_of_plan">End of plan</option>
              <option value="daily">Daily earnings</option>
            </select>
          </div>
          <div className="admin-field">
            <label>Payout mode</label>
            <select
              value={planForm.payout_mode}
              onChange={(e) => setPlanForm((f) => ({ ...f, payout_mode: e.target.value }))}
            >
              <option value="auto">Automatic</option>
              <option value="manual">Manual (admin release)</option>
            </select>
          </div>
          <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={planForm.requires_approval}
                onChange={(e) => setPlanForm((f) => ({ ...f, requires_approval: e.target.checked }))}
              />
              Require admin approval before investment starts
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={planBusy}>
              {planBusy ? 'Creating…' : 'Create plan'}
            </button>
          </div>
        </form>
      </div>

      <div className="admin-card" style={{ marginBottom: '1.25rem' }}>
        <h2>Plans ({plans.length})</h2>
        {plans.length === 0 ? (
          <p style={{ color: 'var(--adm-muted)' }}>No plans yet.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ROI</th>
                  <th>Days</th>
                  <th>Min / Max</th>
                  <th>Payout</th>
                  <th>Stakes</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.roi_percent ?? p.apy_percent}%</td>
                    <td>{p.lock_days}</td>
                    <td>
                      {usdt(p.min_amount)} / {usdt(p.max_amount)}
                    </td>
                    <td>
                      {p.payout_type} · {p.payout_mode}
                      {p.requires_approval ? ' · approval' : ''}
                    </td>
                    <td>
                      {p.active_stakes_count} active / {p.total_stakes_count} total
                      <br />
                      <small>{usdt(p.total_amount_staked)} staked</small>
                    </td>
                    <td>{p.is_active ? 'Active' : 'Disabled'}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--xs"
                        onClick={() => togglePlan(p)}
                      >
                        {p.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdminDataTable
        title="User investments"
        endpoint="/admin/staking/stakes"
        columns={stakeColumns}
        filters={stakeFilters}
        exportFilename="investments.csv"
        refreshKey={stakesRefresh + refreshKey}
        emptyMessage="No investments yet."
      />
    </>
  );
}
