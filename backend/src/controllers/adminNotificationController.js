import {
  getPendingRequestCounts,
  listAdminNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/adminNotificationService.js';
import {
  getFcmStatus,
  registerAdminDeviceToken,
  unregisterAdminDeviceToken,
  sendAdminPushNotification,
} from '../services/fcmPushService.js';
import { error, success } from '../utils/response.js';

export async function notificationSummary(_req, res, next) {
  try {
    const [counts, items] = await Promise.all([
      getPendingRequestCounts(),
      listAdminNotifications({ limit: 40 }),
    ]);
    return success(
      res,
      {
        ...counts,
        items,
      },
      'Admin notifications fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function listNotifications(req, res, next) {
  try {
    const unreadOnly = String(req.query.unread || '') === '1' || req.query.unread === 'true';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const items = await listAdminNotifications({ limit, unreadOnly });
    const counts = await getPendingRequestCounts();
    return success(res, { items, ...counts }, 'Admin notifications listed');
  } catch (e) {
    return next(e);
  }
}

export async function markRead(req, res, next) {
  try {
    const item = await markNotificationRead(req.params.id);
    if (!item) return error(res, 'Notification not found', 404);
    const counts = await getPendingRequestCounts();
    return success(res, { item, ...counts }, 'Notification marked read');
  } catch (e) {
    return next(e);
  }
}

export async function markAllRead(_req, res, next) {
  try {
    const result = await markAllNotificationsRead();
    const counts = await getPendingRequestCounts();
    return success(res, { ...result, ...counts }, 'All notifications marked read');
  } catch (e) {
    return next(e);
  }
}

export async function registerDevice(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) return error(res, 'token is required', 400);
    const doc = await registerAdminDeviceToken({
      userId: req.userId,
      token,
      platform: req.body.platform || 'android',
      deviceLabel: req.body.device_label || req.body.deviceLabel || '',
    });
    return success(
      res,
      { id: doc._id, token: doc.token, platform: doc.platform },
      'Device registered for push'
    );
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function unregisterDevice(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) return error(res, 'token is required', 400);
    const result = await unregisterAdminDeviceToken(token);
    return success(res, result, 'Device unregistered');
  } catch (e) {
    return next(e);
  }
}

/** Debug: FCM config + registered device count */
export async function fcmStatus(_req, res, next) {
  try {
    const status = await getFcmStatus();
    return success(res, status, 'FCM status');
  } catch (e) {
    return next(e);
  }
}

/** Debug: send a test push to all registered admin devices */
export async function testPush(req, res, next) {
  try {
    const status = await getFcmStatus();
    if (!status.configured) {
      return error(
        res,
        status.error ||
          'Firebase not configured. Add backend/secrets/firebase-adminsdk.json (same project as the Android app).',
        503
      );
    }
    if (!status.deviceTokens) {
      return error(res, 'No device tokens. Open the admin Android app and login once.', 400);
    }

    const title = String(req.body.title || 'SafeXchange test').trim();
    const body = String(req.body.body || 'FCM push is working').trim();
    const result = await sendAdminPushNotification({
      title,
      body,
      data: {
        type: 'test',
        section: 'deposits',
        refType: 'deposit',
        refId: '',
      },
    });

    return success(res, { ...status, ...result }, 'Test push sent');
  } catch (e) {
    return next(e);
  }
}
