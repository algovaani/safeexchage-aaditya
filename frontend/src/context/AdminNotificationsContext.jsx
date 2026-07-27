import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, parseApiResponse } from '../api/client.js';
import { getUserSocket } from '../services/appSocket.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';
import { playAdminAlertSound, unlockAdminAlertAudio } from '../utils/adminAlertSound.js';

const AdminNotificationsContext = createContext(null);

const EMPTY_COUNTS = {
  pendingDeposits: 0,
  pendingWithdrawals: 0,
  unread: 0,
};

function showBrowserPush(notification) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(notification.title || 'SafeXchange Admin', {
      body: notification.message || 'New request awaiting review',
      tag: notification.id || `admin-${notification.type}-${Date.now()}`,
      renotify: true,
      silent: false,
    });
    window.setTimeout(() => n.close(), 8000);
  } catch {
    /* ignore */
  }
}

export function AdminNotificationsProvider({ children }) {
  const { token, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const seenIdsRef = useRef(new Set());
  const pushAskedRef = useRef(false);

  const applyCounts = useCallback((next) => {
    if (!next) return;
    setCounts((prev) => ({
      pendingDeposits: Number(next.pendingDeposits ?? prev.pendingDeposits) || 0,
      pendingWithdrawals: Number(next.pendingWithdrawals ?? prev.pendingWithdrawals) || 0,
      unread: Number(next.unread ?? prev.unread) || 0,
    }));
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoading(true);
    try {
      const { data } = await api.get('/admin/notifications/summary');
      const payload = parseApiResponse(data) || {};
      const list = Array.isArray(payload.items) ? payload.items : [];
      setItems(list);
      applyCounts(payload);
      for (const row of list) {
        if (row?.id) seenIdsRef.current.add(row.id);
      }
    } catch {
      /* keep last good state */
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin, applyCounts]);

  const ensurePushPermission = useCallback(() => {
    if (pushAskedRef.current) return;
    pushAskedRef.current = true;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const enableSound = useCallback(async () => {
    const ok = await unlockAdminAlertAudio();
    setSoundReady(Boolean(ok));
    return ok;
  }, []);

  const testSound = useCallback(async () => {
    await enableSound();
    await playAdminAlertSound('deposit');
    toast.info('Alert sound is on', { title: 'Sound test', duration: 2500 });
  }, [enableSound, toast]);

  const onIncoming = useCallback(
    (payload) => {
      const notification = payload?.notification || null;
      applyCounts(payload?.counts);

      if (!notification?.id) return;
      if (seenIdsRef.current.has(notification.id)) return;
      seenIdsRef.current.add(notification.id);

      setItems((prev) => [notification, ...prev.filter((x) => x.id !== notification.id)].slice(0, 50));

      toast.warning(notification.message, {
        title: notification.title || 'New request',
        duration: 9000,
      });

      const kind = notification.refType === 'withdrawal' ? 'withdrawal' : 'deposit';
      void playAdminAlertSound(kind);
      showBrowserPush(notification);
      ensurePushPermission();
    },
    [applyCounts, toast, ensurePushPermission]
  );

  // Browsers block audio until a gesture — unlock on first click/key in admin
  useEffect(() => {
    if (!token || !isAdmin) return undefined;
    const unlock = () => {
      void enableSound();
    };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [token, isAdmin, enableSound]);

  useEffect(() => {
    if (!token || !isAdmin) {
      setItems([]);
      setCounts(EMPTY_COUNTS);
      return undefined;
    }

    refresh();
    ensurePushPermission();

    const socket = getUserSocket(token);
    if (!socket) return undefined;

    const handler = (payload) => onIncoming(payload);
    socket.on('admin:notification', handler);

    const poll = window.setInterval(() => {
      refresh().catch(() => {});
    }, 20_000);

    return () => {
      socket.off('admin:notification', handler);
      window.clearInterval(poll);
    };
  }, [token, isAdmin, refresh, onIncoming, ensurePushPermission]);

  const markRead = useCallback(
    async (id) => {
      if (!id) return;
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
      try {
        const { data } = await api.patch(`/admin/notifications/${id}/read`);
        applyCounts(parseApiResponse(data));
      } catch {
        refresh();
      }
    },
    [applyCounts, refresh]
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setCounts((prev) => ({ ...prev, unread: 0 }));
    try {
      const { data } = await api.patch('/admin/notifications/read-all');
      applyCounts(parseApiResponse(data));
    } catch {
      refresh();
    }
  }, [applyCounts, refresh]);

  const openNotification = useCallback(
    async (notification) => {
      if (!notification) return;
      if (!notification.read) await markRead(notification.id);
      setOpen(false);
      const section = notification.section || (notification.refType === 'withdrawal' ? 'withdrawals' : 'deposits');
      navigate(`/admin/panel?section=${section}`);
    },
    [markRead, navigate]
  );

  const value = useMemo(
    () => ({
      items,
      counts,
      unread: counts.unread,
      pendingDeposits: counts.pendingDeposits,
      pendingWithdrawals: counts.pendingWithdrawals,
      loading,
      open,
      setOpen,
      refresh,
      markRead,
      markAllRead,
      openNotification,
      soundReady,
      enableSound,
      testSound,
    }),
    [
      items,
      counts,
      loading,
      open,
      refresh,
      markRead,
      markAllRead,
      openNotification,
      soundReady,
      enableSound,
      testSound,
    ]
  );

  return (
    <AdminNotificationsContext.Provider value={value}>{children}</AdminNotificationsContext.Provider>
  );
}

export function useAdminNotifications() {
  return useContext(AdminNotificationsContext);
}
