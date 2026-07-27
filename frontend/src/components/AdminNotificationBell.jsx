import { useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useAdminNotifications } from '../context/AdminNotificationsContext.jsx';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function AdminNotificationBell() {
  const {
    items,
    unread,
    pendingDeposits,
    pendingWithdrawals,
    open,
    setOpen,
    markAllRead,
    openNotification,
    loading,
    soundReady,
    testSound,
    enableSound,
  } = useAdminNotifications() || {};

  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    void enableSound?.();
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, setOpen, enableSound]);

  if (!setOpen) return null;

  const badge = unread > 0 ? unread : pendingDeposits + pendingWithdrawals;

  return (
    <div className="admin-notify" ref={panelRef}>
      <button
        type="button"
        className={`admin-notify__bell${badge > 0 ? ' has-unread' : ''}`}
        aria-label={badge > 0 ? `${badge} pending admin alerts` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          void enableSound?.();
          setOpen(!open);
        }}
      >
        <Bell size={18} />
        {badge > 0 && (
          <span className="admin-notify__badge">{badge > 99 ? '99+' : badge}</span>
        )}
      </button>

      {open && (
        <div className="admin-notify__panel" role="dialog" aria-label="Admin notifications">
          <div className="admin-notify__head">
            <div>
              <p className="admin-notify__title">Alerts</p>
              <p className="admin-notify__sub">
                Deposits {pendingDeposits || 0} · Withdrawals {pendingWithdrawals || 0}
                {soundReady ? ' · Sound on' : ' · Click Test sound once'}
              </p>
            </div>
            <div className="admin-notify__head-actions">
              <button type="button" className="admin-notify__mark" onClick={() => testSound?.()}>
                Test sound
              </button>
              <button type="button" className="admin-notify__mark" onClick={() => markAllRead()}>
                Mark all read
              </button>
            </div>
          </div>

          <div className="admin-notify__list">
            {loading && items.length === 0 && <p className="admin-notify__empty">Loading…</p>}
            {!loading && items.length === 0 && (
              <p className="admin-notify__empty">No open deposit or withdrawal alerts</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`admin-notify__item${!n.read ? ' is-unread' : ''}`}
                onClick={() => openNotification(n)}
              >
                <span className={`admin-notify__dot admin-notify__dot--${n.refType}`} />
                <span className="admin-notify__body">
                  <span className="admin-notify__item-title">{n.title}</span>
                  <span className="admin-notify__item-msg">{n.message}</span>
                  <span className="admin-notify__item-meta">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
