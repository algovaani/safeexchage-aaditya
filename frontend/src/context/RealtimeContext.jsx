import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { notifyWalletUpdated } from '../utils/walletEvents.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

const RealtimeContext = createContext(null);

/**
 * Maintains a single authenticated socket connection for the logged-in user and
 * pushes realtime wallet updates to the whole app.
 *
 * - Exposes the latest wallet snapshot + a `walletVersion` counter that bumps on
 *   every update so pages can auto-refetch richer data (summaries, assets…).
 * - Re-broadcasts a `wallet:updated` window event so existing listeners
 *   (ExchangeLayout, etc.) keep working without changes.
 */
export function RealtimeProvider({ children }) {
  const { user, token } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [walletVersion, setWalletVersion] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user || !token) {
      setWallet(null);
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    socketRef.current = socket;

    // Re-auth on (re)connect so the socket rejoins its private user room.
    socket.on('connect', () => socket.emit('auth', token));

    socket.on('wallet:update', (payload) => {
      const nextWallet = payload?.wallet || null;
      if (nextWallet) {
        setWallet(nextWallet);
        notifyWalletUpdated(nextWallet);
      }
      setWalletVersion((v) => v + 1);
    });

    return () => {
      socket.off('wallet:update');
      socket.close();
      socketRef.current = null;
    };
  }, [user, token]);

  const value = useMemo(() => ({ wallet, walletVersion }), [wallet, walletVersion]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext) || { wallet: null, walletVersion: 0 };
}
