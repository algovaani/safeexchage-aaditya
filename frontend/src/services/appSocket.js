import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

let marketSocket = null;
let marketRefs = 0;

let userSocket = null;
let userToken = null;

/** Shared public market stream — one connection for Trade / Futures pages. */
export function acquireMarketSocket() {
  marketRefs += 1;
  if (!marketSocket) {
    marketSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelayMax: 8000,
    });
  } else if (!marketSocket.connected) {
    marketSocket.connect();
  }
  return marketSocket;
}

export function releaseMarketSocket() {
  marketRefs = Math.max(0, marketRefs - 1);
  if (marketRefs === 0 && marketSocket) {
    marketSocket.removeAllListeners();
    marketSocket.disconnect();
    marketSocket = null;
  }
}

/** Authenticated socket for wallet pushes — reused by RealtimeProvider. */
export function getUserSocket(token) {
  if (!token) return null;
  if (!userSocket || userToken !== token) {
    userSocket?.removeAllListeners();
    userSocket?.disconnect();
    userToken = token;
    userSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelayMax: 8000,
    });
    userSocket.on('connect', () => userSocket.emit('auth', token));
  } else if (!userSocket.connected) {
    userSocket.connect();
  }
  return userSocket;
}

export function disconnectUserSocket() {
  userSocket?.removeAllListeners();
  userSocket?.disconnect();
  userSocket = null;
  userToken = null;
}
