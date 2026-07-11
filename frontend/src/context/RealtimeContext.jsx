import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import { disconnectUserSocket, getUserSocket } from '../services/appSocket.js';
import { notifyWalletUpdated } from '../utils/walletEvents.js';

const RealtimeContext = createContext(null);

const PUBLIC_PATHS = new Set(['/', '/login', '/signup', '/forgot-password', '/admin/login']);

export function RealtimeProvider({ children }) {
  const { user, token } = useAuth();
  const { pathname } = useLocation();
  const [wallet, setWallet] = useState(null);
  const [walletVersion, setWalletVersion] = useState(0);

  const shouldConnect = Boolean(user && token && !PUBLIC_PATHS.has(pathname));

  useEffect(() => {
    if (!shouldConnect) {
      disconnectUserSocket();
      setWallet(null);
      return undefined;
    }

    let active = true;

    api
      .get('/wallet/balance')
      .then((r) => {
        if (!active) return;
        const nextWallet = parseApiResponse(r.data);
        if (nextWallet) {
          setWallet(nextWallet);
          notifyWalletUpdated(nextWallet);
        }
      })
      .catch(() => {});

    const socket = getUserSocket(token);

    const onWallet = (payload) => {
      const nextWallet = payload?.wallet || null;
      if (nextWallet) {
        setWallet(nextWallet);
        notifyWalletUpdated(nextWallet);
      }
      setWalletVersion((v) => v + 1);
    };

    socket.on('wallet:update', onWallet);

    return () => {
      active = false;
      socket.off('wallet:update', onWallet);
    };
  }, [shouldConnect, token]);

  const value = useMemo(() => ({ wallet, walletVersion }), [wallet, walletVersion]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext) || { wallet: null, walletVersion: 0 };
}
