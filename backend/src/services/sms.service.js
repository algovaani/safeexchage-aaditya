import axios from 'axios';
import { toIndianMobile10 } from '../utils/identifier.js';

const API_URL = process.env.NINZASMS_API_URL || 'https://ninzasms.in.net/auth/send_sms';

function apiKeyHeader() {
  const raw = String(process.env.NINZASMS_API_KEY || '').trim();
  if (!raw) return '';
  return raw.startsWith('NINZASMS') ? raw : `NINZASMS${raw}`;
}

/**
 * Send OTP via NinzaSMS.
 * @see https://ninzasms.in.net
 * @param {string} mobile - Any Indian mobile format
 * @param {string|number} otp - 4–6 digit OTP
 * @param {{ route?: string }} [opts]
 */
export async function sendSmsOtp(mobile, otp, opts = {}) {
  const numbers = toIndianMobile10(mobile);
  if (!numbers) {
    throw new Error('Invalid Indian mobile number');
  }

  const variables_values = String(otp);
  const senderId = String(process.env.NINZASMS_SENDER_ID || '').trim();
  const authorization = apiKeyHeader();
  const rout = opts.route || process.env.NINZASMS_ROUTE || 'sms';

  if (!authorization || !senderId) {
    console.log(`[sms] NinzaSMS not configured. OTP for ${numbers}: ${variables_values}`);
    return { ok: false, skipped: true };
  }

  const { data } = await axios.post(
    API_URL,
    {
      sender_id: senderId,
      numbers,
      rout,
      variables_values,
    },
    {
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        accept: '*/*',
      },
      timeout: 20_000,
    }
  );

  return { ok: true, data };
}
