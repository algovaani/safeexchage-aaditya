import { AdminNotification } from '../models/AdminNotification.js';
import { Deposit } from '../models/Deposit.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { User } from '../models/User.js';
import { emitAdminNotification } from './socketService.js';
import { sendAdminPushNotification } from './fcmPushService.js';

function userLabel(user) {
  if (!user) return 'User';
  return user.name || user.email || user.mobile || `User ${String(user._id).slice(-6)}`;
}

export function formatAdminNotification(doc) {
  if (!doc) return null;
  const row = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(row._id),
    type: row.type,
    title: row.title,
    message: row.message,
    refType: row.refType,
    refId: row.refId ? String(row.refId) : null,
    userId: row.userId ? String(row.userId) : null,
    amount: row.amount,
    currency: row.currency || '',
    channel: row.channel || '',
    meta: row.meta || null,
    read: Boolean(row.read),
    resolved: Boolean(row.resolved),
    createdAt: row.createdAt,
    readAt: row.readAt || null,
    resolvedAt: row.resolvedAt || null,
    /** Admin panel deep-link section */
    section: row.refType === 'withdrawal' ? 'withdrawals' : 'deposits',
  };
}

export async function getPendingRequestCounts() {
  const [pendingDeposits, pendingWithdrawals, unread] = await Promise.all([
    Deposit.countDocuments({ status: 'pending' }),
    Withdrawal.countDocuments({ status: 'pending' }),
    AdminNotification.countDocuments({ read: false, resolved: false }),
  ]);
  return { pendingDeposits, pendingWithdrawals, unread };
}

async function pushToAdmins(io, notificationDoc, extra = {}) {
  if (!notificationDoc) return;
  const formatted = formatAdminNotification(notificationDoc);
  const counts = extra.counts || (await getPendingRequestCounts());

  if (io) {
    emitAdminNotification(io, {
      notification: formatted,
      counts,
      at: Date.now(),
    });
  }

  // Mobile FCM — works in background + foreground
  void sendAdminPushNotification({
    title: formatted.title,
    body: formatted.message,
    data: {
      type: formatted.type || '',
      refType: formatted.refType || '',
      refId: formatted.refId || '',
      section: formatted.section || 'deposits',
      amount: formatted.amount != null ? String(formatted.amount) : '',
      currency: formatted.currency || '',
      notificationId: formatted.id || '',
    },
  });
}

/**
 * Persist + push admin alert for a new deposit. Never throws to callers.
 */
export async function notifyDepositRequest(io, deposit) {
  try {
    if (!deposit?._id) return null;

    let user = null;
    try {
      user = await User.findById(deposit.userId).select('name email mobile').lean();
    } catch {
      /* ignore */
    }

    const channel = deposit.type === 'fiat' ? 'fiat' : 'crypto';
    const amount = Number(deposit.usdtAmount ?? deposit.amount) || Number(deposit.amount) || 0;
    const currency = String(deposit.currency || 'USDT').toUpperCase();
    const who = userLabel(user);
    const title = 'New deposit request';
    const message = `${who} submitted a ${channel} deposit of ${amount} ${currency} — awaiting approval.`;

    let doc;
    try {
      doc = await AdminNotification.create({
        type: 'deposit_request',
        title,
        message,
        refType: 'deposit',
        refId: deposit._id,
        userId: deposit.userId || null,
        amount,
        currency,
        channel,
        meta: {
          network: deposit.network || '',
          txnHash: deposit.txnHash || '',
          utrNumber: deposit.utrNumber || '',
        },
      });
    } catch (err) {
      if (err?.code === 11000) return null; // already notified
      throw err;
    }

    await pushToAdmins(io, doc);
    return doc;
  } catch (err) {
    console.warn('[adminNotify] deposit:', err.message);
    return null;
  }
}

/**
 * Persist + push admin alert for a new withdrawal. Never throws to callers.
 */
export async function notifyWithdrawalRequest(io, withdrawal) {
  try {
    if (!withdrawal?._id) return null;

    let user = null;
    try {
      user = await User.findById(withdrawal.userId).select('name email mobile').lean();
    } catch {
      /* ignore */
    }

    const channel = withdrawal.type === 'fiat' ? 'fiat' : 'crypto';
    const amount = Number(withdrawal.amount) || 0;
    const currency = String(withdrawal.currency || 'USDT').toUpperCase();
    const who = userLabel(user);
    const title = 'New withdrawal request';
    const message = `${who} requested a ${channel} withdrawal of ${amount} ${currency} — awaiting approval.`;

    let doc;
    try {
      doc = await AdminNotification.create({
        type: 'withdrawal_request',
        title,
        message,
        refType: 'withdrawal',
        refId: withdrawal._id,
        userId: withdrawal.userId || null,
        amount,
        currency,
        channel,
        meta: {
          network: withdrawal.network || '',
          walletAddress: withdrawal.walletAddress || '',
          bankName: withdrawal.bankName || '',
        },
      });
    } catch (err) {
      if (err?.code === 11000) return null;
      throw err;
    }

    await pushToAdmins(io, doc);
    return doc;
  } catch (err) {
    console.warn('[adminNotify] withdrawal:', err.message);
    return null;
  }
}

/** Mark linked alerts resolved when request is approved / rejected / cancelled. */
export async function resolveNotificationsForRef(io, refType, refId) {
  try {
    if (!refType || !refId) return;
    await AdminNotification.updateMany(
      { refType, refId, resolved: false },
      { $set: { resolved: true, resolvedAt: new Date(), read: true, readAt: new Date() } }
    );
    if (io) {
      const counts = await getPendingRequestCounts();
      emitAdminNotification(io, {
        notification: null,
        counts,
        event: 'counts_updated',
        at: Date.now(),
      });
    }
  } catch (err) {
    console.warn('[adminNotify] resolve:', err.message);
  }
}

export async function listAdminNotifications({ limit = 40, unreadOnly = false } = {}) {
  const filter = { resolved: false };
  if (unreadOnly) filter.read = false;
  const rows = await AdminNotification.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map(formatAdminNotification);
}

export async function markNotificationRead(id) {
  const doc = await AdminNotification.findByIdAndUpdate(
    id,
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  return formatAdminNotification(doc);
}

export async function markAllNotificationsRead() {
  const result = await AdminNotification.updateMany(
    { read: false, resolved: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return { modified: result.modifiedCount || 0 };
}
