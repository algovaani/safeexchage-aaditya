import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, TrendingUp, Wallet, Clock, CheckCircle2, X, Coins, CalendarClock, ShieldCheck, AlertTriangle, LogOut } from 'lucide-react';
import { stakingAPI, walletAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { fmtINR } from '../utils/format.js';
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
  if (type === 'monthly') return 'Monthly earnings';
  return 'End of plan';
}

const DEFAULT_EARLY_WITHDRAW_MSG =
  'Early withdrawal returns principal only — no profit. Are you sure you want to continue?';

export default function Staking() {
  const toast = useToast();
  const { toInr } = usePlatformConfig();
  const { wallet: liveWallet, walletVersion } = useRealtime();
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [amount, setAmount] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [earlyWithdrawStake, setEarlyWithdrawStake] = useState(null);

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

  useEffect(() => {
    if (liveWallet) {
      setBalance(Number(liveWallet.balance_usdt ?? liveWallet.balance ?? 0));
    }
  }, [liveWallet, walletVersion]);

  const active = useMemo(
    () => portfolio.filter((p) => ['active', 'pending', 'matured'].includes(p.status)),
    [portfolio]
  );
  const history = useMemo(
    () => portfolio.filter((p) => ['withdrawn', 'rejected'].includes(p.status)),
    [portfolio]
  );

  function openPlan(plan) {
    setSelectedPlan(plan);
    setAmount(String(plan.min_amount || ''));
    setAcceptedTerms(false);
  }

  function closePlan() {
    setSelectedPlan(null);
    setAcceptedTerms(false);
  }

  async function invest(e) {
    e.preventDefault();
    if (!selectedPlan) return;
    const val = Number(amount);
    if (!(val > 0)) {
      toast.warning('Enter a valid USDT amount.');
      return;
    }
    if (val < Number(selectedPlan.min_amount)) {
      toast.warning(`Minimum investment is ${usdt(selectedPlan.min_amount)}.`);
      return;
    }
    if (selectedPlan.has_max && val > Number(selectedPlan.max_amount)) {
      toast.warning(`Maximum investment is ${usdt(selectedPlan.max_amount)}.`);
      return;
    }
    if (selectedPlan.terms && !acceptedTerms) {
      toast.warning('Please accept the terms & conditions to continue.');
      return;
    }
    setBusyId('invest');
    try {
      await stakingAPI.stake(selectedPlan.id, val);
      setAmount('');
      closePlan();
      await load();
    } catch {
      /* toast via interceptor */
    } finally {
      setBusyId(null);
    }
  }

  async function claimOrWithdraw(stake, mode) {
    if (mode === 'early') {
      setEarlyWithdrawStake(stake);
      return;
    }
    setBusyId(stake.id);
    try {
      await stakingAPI.withdraw(stake.id);
      toast.success('Payout claimed to your wallet.');
      await load();
    } catch {
      /* toast */
    } finally {
      setBusyId(null);
    }
  }

  function closeEarlyWithdraw() {
    if (busyId) return;
    setEarlyWithdrawStake(null);
  }

  async function confirmEarlyWithdraw() {
    if (!earlyWithdrawStake) return;
    const stake = earlyWithdrawStake;
    setBusyId(stake.id);
    try {
      await stakingAPI.withdraw(stake.id);
      toast.success('Early withdrawal completed.');
      setEarlyWithdrawStake(null);
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

  <Link to="/wallet/deposit?coin=USDT" className="staking-balance-card">
  <Wallet size={18} />
  <div className="staking-balance-card__info">
    <span className="staking-balance-card__label">Available balance</span>
    <strong>{usdt(balance)}</strong>
    <span className="staking-balance-card__inr">{fmtINR(toInr(balance))}</span>
  </div>
  <span className="staking-link-btn">Deposit USDT</span>
</Link>
</header>

      <div className="staking-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'plans'}
          className={`staking-tab${tab === 'plans' ? ' is-active' : ''}`}
          onClick={() => setTab('plans')}
        >
          <Coins size={15} />
          <span>Plans</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={`staking-tab${tab === 'active' ? ' is-active' : ''}`}
          onClick={() => setTab('active')}
        >
          <TrendingUp size={15} />
          <span>My investments</span>
          {active.length > 0 && <span className="staking-tab__badge">{active.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`staking-tab${tab === 'history' ? ' is-active' : ''}`}
          onClick={() => setTab('history')}
        >
          <Clock size={15} />
          <span>History</span>
          {history.length > 0 && <span className="staking-tab__badge staking-tab__badge--muted">{history.length}</span>}
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
                    Min {usdt(plan.min_amount)} · Max {plan.has_max ? usdt(plan.max_amount) : 'No limit'}
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
                  onClick={() => openPlan(plan)}
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
                          className="staking-btn staking-btn--exit staking-btn--sm"
                          disabled={busyId === row.id}
                          onClick={() => claimOrWithdraw(row, 'early')}
                        >
                          <LogOut size={13} />
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

      {selectedPlan && (() => {
        const roi = Number(selectedPlan.roi_percent ?? selectedPlan.apy_percent) || 0;
        const amt = Number(amount) || 0;
        const profit = amt * (roi / 100);
        const maturity = amt + profit;
        const overBalance = amt > Number(balance);
        const belowMin = amt > 0 && amt < Number(selectedPlan.min_amount);
        const aboveMax = selectedPlan.has_max && amt > Number(selectedPlan.max_amount);
        const quickPick = (pct) => {
          const raw = (Number(balance) * pct) / 100;
          setAmount(raw > 0 ? String(Math.floor(raw * 100) / 100) : '');
        };
        return (
        <div className="staking-modal-backdrop" role="presentation" onClick={closePlan}>
          <div className="staking-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="staking-modal__header">
              <div className="staking-modal__header-icon">
                <TrendingUp size={20} />
              </div>
              <div className="staking-modal__header-text">
                <h2>{selectedPlan.name}</h2>
                <p>Invest USDT and earn {roi}% ROI</p>
              </div>
              <button type="button" className="staking-modal__close" onClick={closePlan} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="staking-modal__stats">
              <div className="staking-modal__stat">
                <span className="staking-modal__stat-label"><TrendingUp size={13} /> ROI</span>
                <strong className="staking-modal__stat-value staking-modal__stat-value--accent">{roi}%</strong>
              </div>
              <div className="staking-modal__stat">
                <span className="staking-modal__stat-label"><Clock size={13} /> Duration</span>
                <strong className="staking-modal__stat-value">{selectedPlan.lock_days}d</strong>
              </div>
              <div className="staking-modal__stat">
                <span className="staking-modal__stat-label"><CalendarClock size={13} /> Payout</span>
                <strong className="staking-modal__stat-value">{payoutLabel(selectedPlan.payout_type)}</strong>
              </div>
            </div>

            <form onSubmit={invest}>
              <div className="staking-field">
                <div className="staking-field__top">
                  <span>Amount to invest</span>
                  <button type="button" className="staking-field__balance" onClick={() => quickPick(100)}>
                    <Wallet size={12} /> {usdt(balance)}
                  </button>
                </div>
                <div className={`staking-amount-input${overBalance || belowMin || aboveMax ? ' is-error' : ''}`}>
                  <input
                    type="number"
                    min={selectedPlan.min_amount}
                    {...(selectedPlan.has_max ? { max: selectedPlan.max_amount } : {})}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                  <span className="staking-amount-input__suffix">USDT</span>
                </div>
                <div className="staking-amount-quick">
                  {[25, 50, 75, 100].map((pct) => (
                    <button type="button" key={pct} onClick={() => quickPick(pct)}>
                      {pct === 100 ? 'Max' : `${pct}%`}
                    </button>
                  ))}
                </div>
                <p className="staking-field__meta">
                  Min {usdt(selectedPlan.min_amount)} ·{' '}
                  {selectedPlan.has_max ? `Max ${usdt(selectedPlan.max_amount)}` : 'No upper limit'}
                </p>
                {belowMin && (
                  <p className="staking-field__error">Minimum investment is {usdt(selectedPlan.min_amount)}.</p>
                )}
                {aboveMax && (
                  <p className="staking-field__error">Maximum investment is {usdt(selectedPlan.max_amount)}.</p>
                )}
                {overBalance && (
                  <p className="staking-field__error">Amount exceeds your available balance.</p>
                )}
              </div>

              <div className="staking-summary">
                <div className="staking-summary__row">
                  <span><Coins size={14} /> You invest</span>
                  <strong>{usdt(amt)}</strong>
                </div>
                <div className="staking-summary__row">
                  <span><TrendingUp size={14} /> Estimated profit</span>
                  <strong className="staking-summary__profit">+{usdt(profit)}</strong>
                </div>
                <div className="staking-summary__divider" />
                <div className="staking-summary__row staking-summary__row--total">
                  <span>Maturity value</span>
                  <strong>{usdt(maturity)}</strong>
                </div>
                <p className="staking-summary__inr">≈ {fmtINR(toInr(maturity))} at maturity</p>
              </div>

              {selectedPlan.terms && (
                <div className="staking-modal__terms">
                  <span className="staking-modal__terms-title">Terms &amp; Conditions</span>
                  <p className="staking-modal__terms-body">{selectedPlan.terms}</p>
                  <label className="staking-modal__terms-accept">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                    />
                    <span>I have read and accept the terms &amp; conditions.</span>
                  </label>
                </div>
              )}
              {selectedPlan.requires_approval && (
                <p className="staking-modal__warn">
                  <ShieldCheck size={14} /> This plan requires admin approval before it becomes active.
                </p>
              )}
              <div className="staking-modal__actions">
                <button type="button" className="staking-btn staking-btn--ghost" onClick={closePlan}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="staking-btn staking-btn--primary"
                  disabled={busyId === 'invest'}
                >
                  {busyId === 'invest' ? <Loader2 className="staking-spin" size={16} /> : 'Confirm investment'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {earlyWithdrawStake && (
        <div className="staking-modal-backdrop" role="presentation" onClick={closeEarlyWithdraw}>
          <div
            className="staking-modal staking-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="early-withdraw-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="staking-modal__header">
              <div className="staking-modal__header-icon staking-modal__header-icon--warn">
                <AlertTriangle size={20} />
              </div>
              <div className="staking-modal__header-text">
                <h2 id="early-withdraw-title">Confirm early exit</h2>
                <p>{earlyWithdrawStake.plan_name}</p>
              </div>
              <button
                type="button"
                className="staking-modal__close"
                onClick={closeEarlyWithdraw}
                aria-label="Close"
                disabled={busyId === earlyWithdrawStake.id}
              >
                <X size={18} />
              </button>
            </div>

            <div className="staking-confirm-summary">
              <div className="staking-confirm-summary__row">
                <span>Principal returned</span>
                <strong>{usdt(earlyWithdrawStake.amount)}</strong>
              </div>
              <div className="staking-confirm-summary__row staking-confirm-summary__row--muted">
                <span>Profit forfeited</span>
                <strong>{usdt(earlyWithdrawStake.earned_so_far ?? earlyWithdrawStake.reward_earned ?? 0)}</strong>
              </div>
              <div className="staking-confirm-summary__row">
                <span>Days remaining</span>
                <strong>{earlyWithdrawStake.days_remaining}d</strong>
              </div>
            </div>

            <div className="staking-confirm-message">
              <p>
                {(earlyWithdrawStake.early_withdrawal_message || '').trim() || DEFAULT_EARLY_WITHDRAW_MSG}
              </p>
            </div>

            <div className="staking-modal__actions">
              <button
                type="button"
                className="staking-btn staking-btn--ghost"
                onClick={closeEarlyWithdraw}
                disabled={busyId === earlyWithdrawStake.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="staking-btn staking-btn--danger"
                onClick={confirmEarlyWithdraw}
                disabled={busyId === earlyWithdrawStake.id}
              >
                {busyId === earlyWithdrawStake.id ? (
                  <Loader2 className="staking-spin" size={16} />
                ) : (
                  'Confirm early exit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
