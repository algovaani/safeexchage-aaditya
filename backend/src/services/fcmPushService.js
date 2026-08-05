import path from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { AdminDeviceToken } from '../models/AdminDeviceToken.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SA_PATH = path.resolve(__dirname, '../../secrets/firebase-adminsdk.json');
const SECRETS_DIR = path.resolve(__dirname, '../../secrets');

let messaging = null;
let initTried = false;
let initError = null;

function resolveServiceAccountPath() {
  const fromEnv =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync(DEFAULT_SA_PATH)) return DEFAULT_SA_PATH;

  // Accept any Firebase Admin SDK JSON dropped into backend/secrets/
  try {
    if (existsSync(SECRETS_DIR)) {
      const match = readdirSync(SECRETS_DIR).find(
        (f) => f.endsWith('.json') && f.includes('firebase-adminsdk')
      );
      if (match) return path.join(SECRETS_DIR, match);
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function getMessaging() {
  if (messaging) return messaging;
  if (initTried) return null;
  initTried = true;

  try {
    const firebaseAdmin = await import('firebase-admin');
    const admin = firebaseAdmin.default || firebaseAdmin;

    if (admin.apps?.length) {
      messaging = admin.messaging();
      return messaging;
    }

    const jsonInline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const saPath = resolveServiceAccountPath();

    if (jsonInline) {
      const cred = JSON.parse(jsonInline);
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    } else if (saPath) {
      const cred = JSON.parse(readFileSync(saPath, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(cred) });
      console.info(`[fcm] Using service account: ${saPath}`);
    } else {
      initError =
        'Push disabled — place Firebase service account at backend/secrets/firebase-adminsdk.json or set FIREBASE_SERVICE_ACCOUNT_PATH';
      console.warn(`[fcm] ${initError}`);
      return null;
    }

    messaging = admin.messaging();
    console.info('[fcm] Firebase Admin messaging ready');
    return messaging;
  } catch (err) {
    initError = err.message;
    console.warn('[fcm] Init failed:', err.message);
    return null;
  }
}

export async function getFcmStatus() {
  const msg = await getMessaging();
  const tokenCount = await AdminDeviceToken.countDocuments();
  return {
    configured: Boolean(msg),
    error: initError,
    deviceTokens: tokenCount,
    serviceAccountPath: resolveServiceAccountPath(),
  };
}

export async function registerAdminDeviceToken({ userId, token, platform = 'android', deviceLabel = '' }) {
  const t = String(token || '').trim();
  if (!userId || !t) {
    throw Object.assign(new Error('token is required'), { status: 400 });
  }

  const doc = await AdminDeviceToken.findOneAndUpdate(
    { token: t },
    {
      $set: {
        userId,
        platform: ['android', 'ios', 'web'].includes(platform) ? platform : 'android',
        deviceLabel: String(deviceLabel || '').slice(0, 120),
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  console.info(`[fcm] device registered user=${userId} platform=${doc.platform}`);
  return doc;
}

export async function unregisterAdminDeviceToken(token) {
  const t = String(token || '').trim();
  if (!t) return { deleted: 0 };
  const result = await AdminDeviceToken.deleteOne({ token: t });
  return { deleted: result.deletedCount || 0 };
}

/**
 * Send FCM to all registered admin devices (foreground + background).
 * Never throws to callers.
 */
export async function sendAdminPushNotification({
  title,
  body,
  data = {},
} = {}) {
  try {
    const msg = await getMessaging();
    if (!msg) {
      console.warn('[fcm] skip send — not configured');
      return { sent: 0, skipped: true, error: initError };
    }

    const tokens = await AdminDeviceToken.find({}).select('token').lean();
    if (!tokens.length) {
      console.warn('[fcm] skip send — no registered device tokens (open admin app & login once)');
      return { sent: 0, skipped: true, error: 'No registered device tokens' };
    }

    const stringData = Object.fromEntries(
      Object.entries({
        ...data,
        title: String(title || ''),
        body: String(body || ''),
      }).map(([k, v]) => [k, v == null ? '' : String(v)])
    );

    const chunkSize = 400;
    let sent = 0;
    const failures = [];
    const stale = [];

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const batch = tokens.slice(i, i + chunkSize).map((r) => r.token);
      const res = await msg.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: String(title || 'SafeXchange Admin'),
          body: String(body || ''),
        },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            channelId: 'admin_requests',
            sound: 'default',
            priority: 'high',
            defaultVibrateTimings: true,
          },
        },
      });

      sent += res.successCount || 0;
      res.responses?.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code || '';
          const message = r.error?.message || 'unknown';
          failures.push({ code, message });
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token')
          ) {
            stale.push(batch[idx]);
          }
        }
      });
    }

    if (stale.length) {
      await AdminDeviceToken.deleteMany({ token: { $in: stale } });
    }

    console.info(`[fcm] sent=${sent} tokens=${tokens.length} stale=${stale.length}`);
    if (failures.length) {
      console.warn('[fcm] sample failure:', failures[0]);
    }

    return { sent, total: tokens.length, stale: stale.length, failures: failures.slice(0, 3) };
  } catch (err) {
    console.warn('[fcm] send failed:', err.message);
    return { sent: 0, error: err.message };
  }
}
