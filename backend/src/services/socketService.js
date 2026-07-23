import { verifyToken } from '../utils/token.js';
import { Wallet } from '../models/Wallet.js';
import { listUserAssets } from './assetBalanceService.js';
import { formatWalletSnapshot } from './walletAdjustmentService.js';

function userRoom(userId) {
  return `user:${String(userId)}`;
}

function joinUserRoom(socket, token) {
  try {
    if (!token) return false;
    const payload = verifyToken(token);
    const userId = String(payload.sub || payload.id || payload._id || '');
    if (!userId) return false;
    socket.userId = userId;
    socket.join(userRoom(userId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Attaches per-user private rooms so we can push realtime updates (wallet, etc.)
 * to a specific logged-in user. Anonymous sockets (market data) keep working.
 */
export function attachUserSockets(io) {
  io.use((socket, next) => {
    const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    joinUserRoom(socket, token);
    next();
  });

  io.on('connection', (socket) => {
    // Allow late authentication (e.g. user logs in without reconnecting).
    socket.on('auth', (token) => {
      joinUserRoom(socket, token);
    });
  });
}

/**
 * Pushes the user's latest wallet balance to all of their connected sockets.
 * Always reads a fresh snapshot from DB so clients never get stale data.
 */
export async function emitWalletUpdate(io, userId, { reason = null } = {}) {
  if (!io || !userId) return;
  try {
    const [wallet, assets] = await Promise.all([
      Wallet.findOne({ userId }).lean(),
      listUserAssets(userId),
    ]);
    io.to(userRoom(userId)).emit('wallet:update', {
      wallet: formatWalletSnapshot(wallet, assets),
      reason,
      at: Date.now(),
    });
  } catch {
    /* realtime is best-effort — never block the request flow */
  }
}

/** Push futures position updates to the user's private socket room. */
export function emitFuturesUpdate(io, userId, payload = {}) {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit('futures:update', {
    ...payload,
    at: Date.now(),
  });
}
