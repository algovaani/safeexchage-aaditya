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
  deposit: 'badge-green',
  withdrawal: 'badge-amber',
  trade: 'badge-blue',
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
