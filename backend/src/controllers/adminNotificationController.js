import {
  getPendingRequestCounts,
  listAdminNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/adminNotificationService.js';
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
