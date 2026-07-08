import { useCallback, useEffect, useState } from 'react';
import { api, parseApiResponse } from '../../api/client.js';
import { useDialog } from '../../context/DialogContext.jsx';
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
  terms: '',
  early_withdrawal_message: '',
};

function usdt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

export default function StakingAdminSection({ refreshKey = 0, onMutate }) {
  const dialog = useDialog();
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState(null);
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
        max_amount: planForm.max_amount === '' ? 0 : Number(planForm.max_amount),
        payout_type: planForm.payout_type,
        payout_mode: planForm.payout_mode,
        requires_approval: planForm.requires_approval,
        terms: planForm.terms.trim(),
        early_withdrawal_message: planForm.early_withdrawal_message.trim(),
      };
      if (editingPlanId) {
        await api.patch(`/admin/staking/plans/${editingPlanId}`, body);
      } else {
        await api.post('/admin/staking/plans', body);
      }
      setPlanForm(EMPTY_PLAN);
      setEditingPlanId(null);
      await loadPlans();
      onMutate?.();
    } catch {
      /* toast */
    } finally {
      setPlanBusy(false);
    }
  }

  function startEditPlan(plan) {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name || '',
      roi_percent: String(plan.roi_percent ?? plan.apy_percent ?? ''),
      lock_days: String(plan.lock_days ?? '30'),
      min_amount: String(plan.min_amount ?? ''),
      max_amount: plan.has_max ? String(plan.max_amount ?? '') : '',
      payout_type: plan.payout_type || 'end_of_plan',
      payout_mode: plan.payout_mode || 'auto',
      requires_approval: Boolean(plan.requires_approval),
      terms: plan.terms || '',
      early_withdrawal_message: plan.early_withdrawal_message || '',
    });
  }

  function cancelEditPlan() {
    setEditingPlanId(null);
    setPlanForm(EMPTY_PLAN);
  }

  async function togglePlan(plan) {
    await api.patch(`/admin/staking/plans/${plan.id}`, { is_active: !plan.is_active });
    await loadPlans();
    onMutate?.();
  }

  async function softDeletePlan(plan) {
    if (plan.is_deleted) return;
    if (plan.active_stakes_count > 0) {
      await dialog.alert({
        title: 'Cannot delete plan',
        message: `This plan has ${plan.active_stakes_count} active or pending investment(s) and cannot be deleted yet.`,
        variant: 'warning',
        confirmLabel: 'OK',
      });
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Soft delete plan',
      message: `Soft delete "${plan.name}"? It will be hidden from users but existing history is kept.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingPlanId(plan.id);
    try {
      await api.delete(`/admin/staking/plans/${plan.id}`);
      if (editingPlanId === plan.id) {
        cancelEditPlan();
      }
      await loadPlans();
      onMutate?.();
    } catch {
      /* toast */
    } finally {
      setDeletingPlanId(null);
    }
  }

  async function reviewStake(id, action) {
    let note = '';
    if (action === 'reject') {
      const result = await dialog.prompt({
        title: 'Reject investment',
        message: 'Add an optional note for the user.',
        label: 'Rejection note',
        placeholder: 'Reason for rejection (optional)',
        confirmLabel: 'Reject',
        cancelLabel: 'Cancel',
        variant: 'danger',
      });
      if (result === null) return;
      note = result;
    }
    await api.patch(`/admin/staking/stakes/${id}/review`, { action, note });
    setStakesRefresh((k) => k + 1);
    onMutate?.();
  }

  async function releasePayout(id) {
    const confirmed = await dialog.confirm({
      title: 'Release payout',
      message: 'Release maturity payout to user wallet?',
      confirmLabel: 'Release',
      cancelLabel: 'Cancel',
      variant: 'primary',
    });
    if (!confirmed) return;
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
        <h2>{editingPlanId ? 'Edit investment plan' : 'Create investment plan'}</h2>
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
            <label>Total ROI % (over full period)</label>
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
            <label>Max investment (USDT) — leave blank for no limit</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={planForm.max_amount}
              onChange={(e) => setPlanForm((f) => ({ ...f, max_amount: e.target.value }))}
              placeholder="No limit"
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
              <option value="monthly">Monthly earnings</option>
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
            <label>Terms &amp; conditions (shown to user before investing)</label>
            <textarea
              rows={4}
              value={planForm.terms}
              onChange={(e) => setPlanForm((f) => ({ ...f, terms: e.target.value }))}
              placeholder="e.g. Funds are locked for the full duration. ROI is paid at maturity…"
              maxLength={5000}
            />
          </div>
          <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
            <label>Early withdrawal message (shown when user exits before maturity)</label>
            <textarea
              rows={3}
              value={planForm.early_withdrawal_message}
              onChange={(e) => setPlanForm((f) => ({ ...f, early_withdrawal_message: e.target.value }))}
              placeholder="e.g. Early withdrawal returns principal only — no profit. Are you sure you want to continue?"
              maxLength={2000}
            />
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
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={planBusy}>
              {planBusy ? 'Saving…' : editingPlanId ? 'Update plan' : 'Create plan'}
            </button>
            {editingPlanId && (
              <button type="button" className="admin-btn admin-btn--ghost" onClick={cancelEditPlan} disabled={planBusy}>
                Cancel edit
              </button>
            )}
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className={p.is_deleted ? 'admin-table-row--muted' : undefined}>
                    <td>{p.name}</td>
                    <td>{p.roi_percent ?? p.apy_percent}%</td>
                    <td>{p.lock_days}</td>
                    <td>
                      {usdt(p.min_amount)} / {p.has_max ? usdt(p.max_amount) : 'No limit'}
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
                    <td>
                      {p.is_deleted ? (
                        <span className="admin-status-pill admin-status-pill--muted">Deleted</span>
                      ) : p.is_active ? (
                        <span className="admin-status-pill admin-status-pill--success">Active</span>
                      ) : (
                        <span className="admin-status-pill admin-status-pill--warn">Disabled</span>
                      )}
                    </td>
                    <td>
                      {p.is_deleted ? (
                        <span style={{ color: 'var(--adm-muted)', fontSize: '0.75rem' }}>—</span>
                      ) : (
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--xs"
                            onClick={() => startEditPlan(p)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--xs"
                            onClick={() => togglePlan(p)}
                          >
                            {p.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger admin-btn--xs"
                            disabled={deletingPlanId === p.id || p.active_stakes_count > 0}
                            title={
                              p.active_stakes_count > 0
                                ? 'Cannot delete while active or pending investments exist'
                                : 'Soft delete plan'
                            }
                            onClick={() => softDeletePlan(p)}
                          >
                            {deletingPlanId === p.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      )}
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
