import axios from 'axios';
import { normalizeMobile } from '../utils/identifier.js';

const API_URL = process.env.NINZASMS_API_URL || 'https://ninzasms.in.net/auth/send_sms';

function apiKeyHeader() {
  const raw = String(process.env.NINZASMS_API_KEY || '').trim();
  if (!raw) return '';
  return raw.startsWith('NINZASMS') ? raw : `NINZASMS${raw}`;
}

/** Format mobile for NinzaSMS (India: 91 + 10 digits). */
export function formatSmsRecipient(mobile) {
  const normalized = normalizeMobile(mobile);
  let digits = normalized.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

/**
 * Send OTP via NinzaSMS template API.
 * @see https://ninzasms.in.net
 */
export async function sendSmsOtp(mobile, otp) {
  const numbers = formatSmsRecipient(mobile);
  const variables_values = String(otp);
  const senderId = String(process.env.NINZASMS_SENDER_ID || '').trim();
  const authorization = apiKeyHeader();

  if (!authorization || !senderId) {
    console.log(`[sms] NinzaSMS not configured. OTP for ${numbers}: ${variables_values}`);
    return { ok: false, skipped: true };
  }

  const { data } = await axios.post(
    API_URL,
    {
      sender_id: senderId,
      variables_values,
      numbers,
    },
    {
      headers: {
        authorization,
        'content-type': 'application/json',
        accept: '*/*',
      },
      timeout: 20_000,
    }
  );

  return { ok: true, data };
}
