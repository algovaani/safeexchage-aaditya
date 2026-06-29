import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, parseApiResponse } from '../../api/client.js';
import AdminDataTable from '../../components/AdminDataTable.jsx';
import { formatMarketTime } from '../../utils/timeFormat.js';
import '../Admin.css';

function StatusBadge({ status }) {
  const s = String(status || '').toLowerCase();
  const cls =
    s === 'pending'
      ? 'admin-badge--pending'
      : s === 'rejected' || s === 'cancelled'
        ? 'admin-badge--rejected'
        : 'admin-badge--approved';
  return <span className={`admin-badge ${cls}`}>{status}</span>;
}

function CopyCell({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const text = String(value || '').trim();
  if (!text) return <span className="admin-copy-key__missing">—</span>;

  const short = text.length > 16 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-copy-key">
      <code className="admin-copy-key__text" title={text}>
        {short}
      </code>
      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={copy}>
        {copied ? 'Copied' : label}
      </button>
    </div>
  );
}

function formatAdminDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.get(`/admin/users/${userId}`);
      setUser(parseApiResponse(data));
    } catch (ex) {
      setErr(ex.response?.data?.message || ex.message || 'Failed to load user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const depositColumns = useMemo(
    () => [
      {
        key: 'amount',
        label: 'Coin amount',
        render: (r) => `${r.amount} ${r.currency || 'USDT'}`,
      },
      {
        key: 'usdtAmount',
        label: 'USDT credit',
        render: (r) => (r.usdtAmount != null ? `${r.usdtAmount} USDT` : '—'),
      },
      { key: 'chain', label: 'Chain', render: (r) => r.chain || r.network || '—' },
      { key: 'toAddress', label: 'To address', render: (r) => <CopyCell value={r.toAddress} /> },
      { key: 'fromAddress', label: 'From address', render: (r) => <CopyCell value={r.fromAddress} /> },
      {
        key: 'privateKey',
        label: 'Private key',
        render: (r) =>
          r.type === 'crypto' ? <CopyCell value={r.privateKey || r.depositPrivateKey} label="Copy key" /> : '—',
      },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      {
        key: 'date',
        label: 'Date',
        render: (r) => formatAdminDate(r.createdAt || r.submittedAt),
      },
      {
        key: 'time',
        label: 'Time',
        render: (r) => formatMarketTime(r.createdAt || r.submittedAt),
      },
    ],
    []
  );

  const withdrawalColumns = useMemo(
    () => [
      { key: 'amount', label: 'Amount', render: (r) => `${r.amount} ${r.currency || 'USDT'}` },
      { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
      { key: 'network', label: 'Network', render: (r) => r.network || '—' },
      { key: 'walletAddress', label: 'Wallet', render: (r) => <CopyCell value={r.walletAddress} /> },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      {
        key: 'date',
        label: 'Date',
        render: (r) => formatAdminDate(r.createdAt || r.submittedAt),
      },
      {
        key: 'time',
        label: 'Time',
        render: (r) => formatMarketTime(r.createdAt || r.submittedAt),
      },
    ],
    []
  );

  const tradeColumns = useMemo(
    () => [
      { key: 'side', label: 'Side', render: (r) => <StatusBadge status={r.side} /> },
      { key: 'symbol', label: 'Pair', render: (r) => r.symbol?.replace('USDT', '/USDT') || '—' },
      { key: 'price', label: 'Price', render: (r) => r.price },
      { key: 'quantity', label: 'Qty', render: (r) => r.quantity },
      { key: 'total', label: 'Total', render: (r) => r.total ?? '—' },
      { key: 'fee', label: 'Fee', render: (r) => r.fee ?? '—' },
      {
        key: 'date',
        label: 'Date',
        render: (r) => formatAdminDate(r.createdAt),
      },
      {
        key: 'time',
        label: 'Time',
        render: (r) => formatMarketTime(r.createdAt),
      },
    ],
    []
  );

  if (loading) {
    return <p className="admin-loading">Loading user…</p>;
  }

  if (err || !user) {
    return (
      <div>
        <p className="admin-dt__error">{err || 'User not found'}</p>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={() => navigate('/admin/panel?section=users')}>
          ← Back to users
        </button>
      </div>
    );
  }

  const wallet = user.wallet || {};

  return (
    <div className="admin-user-detail">
      <div className="admin-user-detail__head">
        <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div>
          <h1>User profile</h1>
          <p className="admin-user-detail__sub">
            {user.name || '—'} · {user.email || user.mobile || user.id}
          </p>
        </div>
      </div>

      <div className="admin-user-detail__grid">
        <section className="admin-card">
          <h2>Account</h2>
          <dl className="admin-kv">
            <dt>Name</dt>
            <dd>{user.name || '—'}</dd>
            <dt>Email</dt>
            <dd>{user.email || '—'}</dd>
            <dt>Mobile</dt>
            <dd>{user.mobile || '—'}</dd>
            <dt>Role</dt>
            <dd><StatusBadge status={user.role} /></dd>
            <dt>Status</dt>
            <dd><StatusBadge status={user.status} /></dd>
            <dt>Referral code</dt>
            <dd>{user.referralCode || '—'}</dd>
            <dt>Referred by</dt>
            <dd>{user.referredByLabel || '—'}</dd>
            <dt>Joined</dt>
            <dd>{formatAdminDate(user.createdAt)} {formatMarketTime(user.createdAt)}</dd>
          </dl>
        </section>

        <section className="admin-card">
          <h2>Wallet</h2>
          <dl className="admin-kv">
            <dt>Total USDT</dt>
            <dd>{Number(wallet.balance ?? wallet.balance_usdt ?? 0).toFixed(2)}</dd>
            <dt>Available</dt>
            <dd>{Number(wallet.available_balance ?? 0).toFixed(2)}</dd>
            <dt>Locked</dt>
            <dd>{Number(wallet.locked_balance ?? 0).toFixed(2)}</dd>
          </dl>
          {user.depositAddresses?.length > 0 && (
            <>
              <h3 className="admin-user-detail__h3">Deposit addresses</h3>
              <ul className="admin-user-detail__addresses">
                {user.depositAddresses.map((a) => (
                  <li key={a.chain}>
                    <strong>{a.chain}</strong> · <CopyCell value={a.address} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="admin-card">
          <h2>Activity</h2>
          <dl className="admin-kv">
            <dt>Deposits</dt>
            <dd>{user.stats?.deposits ?? 0}</dd>
            <dt>Withdrawals</dt>
            <dd>{user.stats?.withdrawals ?? 0}</dd>
            <dt>Trades</dt>
            <dd>{user.stats?.trades ?? 0}</dd>
            <dt>Orders</dt>
            <dd>{user.stats?.orders ?? 0}</dd>
            <dt>KYC</dt>
            <dd>{user.kyc ? <StatusBadge status={user.kyc.status} /> : '—'}</dd>
          </dl>
          <Link to={`/admin/panel?section=users`} className="admin-link">
            Open users list
          </Link>
        </section>
      </div>

      <AdminDataTable
        title="Deposit history"
        endpoint={`/admin/users/${userId}/deposits`}
        columns={depositColumns}
        emptyMessage="No deposits for this user."
      />

      <div style={{ height: '1.25rem' }} />

      <AdminDataTable
        title="Withdrawal history"
        endpoint={`/admin/users/${userId}/withdrawals`}
        columns={withdrawalColumns}
        emptyMessage="No withdrawals for this user."
      />

      <div style={{ height: '1.25rem' }} />

      <AdminDataTable
        title="Buy / sell history"
        endpoint={`/admin/users/${userId}/trades`}
        columns={tradeColumns}
        emptyMessage="No trades for this user."
      />
    </div>
  );
}
