import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import { disconnectUserSocket, getUserSocket } from '../services/appSocket.js';
import { notifyWalletUpdated } from '../utils/walletEvents.js';
import { readSwrSync, writeSwrSync, SwrKeys } from '../utils/swrCache.js';

const RealtimeContext = createContext(null);

const PUBLIC_PATHS = new Set(['/', '/login', '/signup', '/forgot-password', '/admin/login']);

export function RealtimeProvider({ children }) {
  const { user, token } = useAuth();
  const { pathname } = useLocation();
  const [wallet, setWallet] = useState(() => readSwrSync(SwrKeys.walletBalance)?.data || null);
  const [walletVersion, setWalletVersion] = useState(0);

  const shouldConnect = Boolean(user && token && !PUBLIC_PATHS.has(pathname));

  const commitWallet = useCallback((nextWallet) => {
    if (!nextWallet) return;
    setWallet(nextWallet);
    writeSwrSync(SwrKeys.walletBalance, nextWallet);
    setWalletVersion((v) => v + 1);
  }, []);

  const publishWallet = useCallback(
    (nextWallet) => {
      if (!nextWallet) return;
      commitWallet(nextWallet);
      notifyWalletUpdated(nextWallet);
    },
    [commitWallet]
  );

  const refreshWallet = useCallback(async () => {
    try {
      const { data } = await api.get('/wallet/balance');
      const nextWallet = parseApiResponse(data);
      publishWallet(nextWallet);
      return nextWallet;
    } catch {
      return null;
    }
  }, [publishWallet]);

  // Sync when a page pushes a wallet snapshot (trade response, etc.)
  useEffect(() => {
    const onLocalWallet = (e) => {
      commitWallet(e.detail || null);
    };
    window.addEventListener('wallet:updated', onLocalWallet);
    return () => window.removeEventListener('wallet:updated', onLocalWallet);
  }, [commitWallet]);

  useEffect(() => {
    if (!shouldConnect) {
      disconnectUserSocket();
      return undefined;
    }

    let active = true;

    refreshWallet().catch(() => {});

    const socket = getUserSocket(token);

    const onWallet = (payload) => {
      if (!active) return;
      commitWallet(payload?.wallet || null);
    };

    socket.on('wallet:update', onWallet);

    return () => {
      active = false;
      socket.off('wallet:update', onWallet);
    };
  }, [shouldConnect, token, refreshWallet, commitWallet]);

  const value = useMemo(
    () => ({ wallet, walletVersion, refreshWallet, publishWallet }),
    [wallet, walletVersion, refreshWallet, publishWallet]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return (
    useContext(RealtimeContext) || {
      wallet: null,
      walletVersion: 0,
      refreshWallet: async () => null,
      publishWallet: () => {},
    }
  );
}
