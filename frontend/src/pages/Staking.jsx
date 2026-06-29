import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, TrendingUp, Wallet, Clock, CheckCircle2 } from 'lucide-react';
import { stakingAPI, walletAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import './Staking.css';

function usdt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  const cls =
    s === 'active'
      ? 'staking-pill--active'
      : s === 'pending'
        ? 'staking-pill--pending'
        : s === 'matured'
          ? 'staking-pill--matured'
          : s === 'rejected'
            ? 'staking-pill--rejected'
            : 'staking-pill--done';
  return <span className={`staking-pill ${cls}`}>{status}</span>;
}

function payoutLabel(type) {
  if (type === 'daily') return 'Daily earnings';
  return 'End of plan';
}

export default function Staking() {
  const toast = useToast();
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planRows, stakeRows, wallet] = await Promise.all([
        stakingAPI.getPlans(),
        stakingAPI.getPortfolio(),
        walletAPI.getBalance(),
      ]);
      setPlans(Array.isArray(planRows) ? planRows : []);
      setPortfolio(Array.isArray(stakeRows) ? stakeRows : []);
      setBalance(Number(wallet?.balance_usdt ?? wallet?.balance ?? 0));
    } catch {
      setPlans([]);
      setPortfolio([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(
    () => portfolio.filter((p) => ['active', 'pending', 'matured'].includes(p.status)),
    [portfolio]
  );
  const history = useMemo(
    () => portfolio.filter((p) => ['withdrawn', 'rejected'].includes(p.status)),
    [portfolio]
  );

  async function invest(e) {
    e.preventDefault();
    if (!selectedPlan) return;
    const val = Number(amount);
    if (!(val > 0)) {
      toast.warning('Enter a valid USDT amount.');
      return;
    }
    setBusyId('invest');
    try {
      await stakingAPI.stake(selectedPlan.id, val);
      setAmount('');
      setSelectedPlan(null);
      await load();
    } catch {
      /* toast via interceptor */
    } finally {
      setBusyId(null);
    }
  }

  async function claimOrWithdraw(stake, mode) {
    const label = mode === 'claim' ? 'Claim maturity payout' : 'Early withdraw';
    if (mode === 'early' && !window.confirm('Early withdrawal returns principal only — no profit. Continue?')) {
      return;
    }
    setBusyId(stake.id);
    try {
      await stakingAPI.withdraw(stake.id);
      toast.success(mode === 'claim' ? 'Payout claimed to your wallet.' : 'Early withdrawal completed.');
      await load();
    } catch {
      /* toast */
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="staking-page staking-page--loading">
        <Loader2 className="staking-spin" size={28} />
        <p>Loading investment plans…</p>
      </div>
    );
  }

  return (
    <div className="staking-page">
      <header className="staking-header">
        <div>
          <h1>Investment Plans</h1>
          <p>Stake USDT in fixed-duration plans and earn ROI at maturity or daily.</p>
        </div>
        <div className="staking-balance-card">
          <Wallet size={18} />
          <div>
            <span className="staking-balance-card__label">Available balance</span>
            <strong>{usdt(balance)}</strong>
          </div>
          <Link to="/wallet/deposit?coin=USDT" className="staking-link-btn">
            Deposit USDT
          </Link>
        </div>
      </header>

      <div className="staking-tabs">
        <button type="button" className={tab === 'plans' ? 'is-active' : ''} onClick={() => setTab('plans')}>
          Plans
        </button>
        <button type="button" className={tab === 'active' ? 'is-active' : ''} onClick={() => setTab('active')}>
          My investments ({active.length})
        </button>
        <button type="button" className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>
          History
        </button>
      </div>

      {tab === 'plans' && (
        <div className="staking-plans-grid">
          {plans.length === 0 ? (
            <p className="staking-empty">No investment plans available yet.</p>
          ) : (
            plans.map((plan) => (
              <article key={plan.id} className="staking-plan-card">
                <div className="staking-plan-card__head">
                  <h3>{plan.name}</h3>
                  <span className="staking-plan-card__roi">{plan.roi_percent ?? plan.apy_percent}% ROI</span>
                </div>
                <ul className="staking-plan-card__meta">
                  <li>
                    <Clock size={14} /> {plan.lock_days} days
                  </li>
                  <li>
                    <TrendingUp size={14} /> {payoutLabel(plan.payout_type)}
                  </li>
                  <li>
                    Min {usdt(plan.min_amount)} · Max {usdt(plan.max_amount)}
                  </li>
                  {plan.requires_approval && <li>Requires admin approval</li>}
                </ul>
                <p className="staking-plan-card__hint">
                  Example: invest {usdt(1000)} → maturity{' '}
                  {usdt(1000 * (1 + Number(plan.roi_percent ?? plan.apy_percent) / 100))}
                </p>
                <button
                  type="button"
                  className="staking-btn staking-btn--primary"
                  onClick={() => {
                    setSelectedPlan(plan);
                    setAmount(String(plan.min_amount));
                  }}
                >
                  Invest USDT
                </button>
              </article>
            ))
          )}
        </div>
      )}

      {tab === 'active' && (
        <div className="staking-table-wrap">
          {active.length === 0 ? (
            <p className="staking-empty">No active investments. Choose a plan to get started.</p>
          ) : (
            <table className="staking-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Profit</th>
                  <th>Maturity</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.plan_name}</strong>
                      <span className="staking-table__sub">
                        {row.lock_days}d · {row.roi_percent ?? row.apy_percent}% ROI
                      </span>
                    </td>
                    <td>{usdt(row.amount)}</td>
                    <td>
                      {usdt(row.reward_earned ?? row.earned_so_far)}
                      {row.payout_type === 'daily' && (
                        <span className="staking-table__sub">daily credited</span>
                      )}
                    </td>
                    <td>
                      {row.status === 'pending' ? (
                        'Awaiting approval'
                      ) : (
                        <>
                          {row.maturity_amount ? usdt(row.maturity_amount) : '—'}
                          <span className="staking-table__sub">
                            {row.days_remaining}d left
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <StatusPill status={row.status} />
                      {row.awaiting_admin_release && (
                        <span className="staking-table__sub">Awaiting admin payout</span>
                      )}
                    </td>
                    <td className="staking-table__actions">
                      {row.can_claim && (
                        <button
                          type="button"
                          className="staking-btn staking-btn--sm"
                          disabled={busyId === row.id}
                          onClick={() => claimOrWithdraw(row, 'claim')}
                        >
                          {busyId === row.id ? <Loader2 className="staking-spin" size={14} /> : 'Claim'}
                        </button>
                      )}
                      {row.can_early_withdraw && (
                        <button
                          type="button"
                          className="staking-btn staking-btn--ghost staking-btn--sm"
                          disabled={busyId === row.id}
                          onClick={() => claimOrWithdraw(row, 'early')}
                        >
                          Early exit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="staking-table-wrap">
          {history.length === 0 ? (
            <p className="staking-empty">No completed investments yet.</p>
          ) : (
            <table className="staking-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Profit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.plan_name}</td>
                    <td>{usdt(row.amount)}</td>
                    <td>{usdt(row.reward_earned)}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedPlan && (
        <div className="staking-modal-backdrop" role="presentation" onClick={() => setSelectedPlan(null)}>
          <div className="staking-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Invest in {selectedPlan.name}</h2>
            <p className="staking-modal__sub">
              {selectedPlan.lock_days} days · {selectedPlan.roi_percent ?? selectedPlan.apy_percent}% ROI ·{' '}
              {payoutLabel(selectedPlan.payout_type)} · USDT only
            </p>
            <form onSubmit={invest}>
              <label className="staking-field">
                <span>Amount (USDT)</span>
                <input
                  type="number"
                  min={selectedPlan.min_amount}
                  max={selectedPlan.max_amount}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
              <p className="staking-modal__hint">
                Min {usdt(selectedPlan.min_amount)} · Max {usdt(selectedPlan.max_amount)} · Balance{' '}
                {usdt(balance)}
              </p>
              {selectedPlan.requires_approval && (
                <p className="staking-modal__warn">
                  <CheckCircle2 size={14} /> This plan requires admin approval before it becomes active.
                </p>
              )}
              <div className="staking-modal__actions">
                <button type="button" className="staking-btn staking-btn--ghost" onClick={() => setSelectedPlan(null)}>
                  Cancel
                </button>
                <button type="submit" className="staking-btn staking-btn--primary" disabled={busyId === 'invest'}>
                  {busyId === 'invest' ? <Loader2 className="staking-spin" size={16} /> : 'Confirm investment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
