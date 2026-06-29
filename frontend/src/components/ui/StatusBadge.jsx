const STYLES = {
  approved: 'badge-green',
  active: 'badge-green',
  completed: 'badge-green',
  filled: 'badge-green',
  open: 'badge-green',
  pending: 'badge-amber',
  rejected: 'badge-red',
  closed: 'badge-red',
  cancelled: 'badge-muted',
  not_submitted: 'badge-muted',
  buy: 'badge-green',
  sell: 'badge-red',
  hold: 'badge-amber',
  deposit: 'badge-green',
  withdrawal: 'badge-amber',
  trade: 'badge-blue',
  trade_margin_locked: 'badge-amber',
  trade_profit: 'badge-green',
  trade_loss: 'badge-red',
  trade_margin_returned: 'badge-blue',
  stake_locked: 'badge-amber',
  stake_reward: 'badge-green',
  referral_reward: 'badge-green',
};

export default function StatusBadge({ status, className = '' }) {
  const key = (status || 'not_submitted').toLowerCase().replace(/\s+/g, '_');
  const style = STYLES[key] || 'badge-muted';

  return (
    <span className={`badge ${style} ${className}`.trim()}>
      {(status || 'not submitted').replace(/_/g, ' ')}
    </span>
  );
}
