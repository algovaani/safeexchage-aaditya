import axios from 'axios';
import { toIndianMobile10 } from '../utils/identifier.js';

const API_URL = process.env.NINZASMS_API_URL || 'https://ninzasms.in.net/auth/send_sms';

function apiKeyHeader() {
  const raw = String(process.env.NINZASMS_API_KEY || '').trim();
  if (!raw) return '';
  return raw.startsWith('NINZASMS') ? raw : `NINZASMS${raw}`;
}

function templateId() {
  return String(process.env.NINZASMS_TEMPLATE_ID || '').trim();
}

function senderId() {
  return String(process.env.NINZASMS_SENDER_ID || '').trim();
}

/** True when NinzaSMS can send (API key + template or sender id). */
export function isNinzaSmsConfigured() {
  const key = apiKeyHeader();
  if (!key) return false;
  return Boolean(templateId() || senderId());
}

function buildPayload(numbers, otp, opts = {}) {
  const variables_values = String(otp);
  const rout = opts.route || process.env.NINZASMS_ROUTE || 'sms';
  const tpl = templateId();

  // DLT template mode (NinzaSMS panel template id, e.g. 15582)
  if (tpl) {
    return {
      [tpl]: '',
      variables_values,
      numbers,
      ...(opts.message ? { message: opts.message } : {}),
    };
  }

  return {
    sender_id: senderId(),
    numbers,
    rout,
    variables_values,
    ...(opts.message ? { message: opts.message } : {}),
  };
}

function assertSmsSuccess(data) {
  if (!data || typeof data !== 'object') return;

  const status = String(data.status || data.Status || '').toLowerCase();
  const successFlag = data.success ?? data.Success;
  const message = String(data.message || data.Message || data.error || data.Error || '').toLowerCase();

  if (successFlag === false) {
    throw new Error(data.message || data.Message || 'NinzaSMS rejected the request');
  }

  if (['failed', 'error', 'rejected'].includes(status)) {
    throw new Error(data.message || data.Message || `NinzaSMS status: ${status}`);
  }

  if (message && /fail|error|invalid|reject/.test(message) && successFlag !== true) {
    throw new Error(data.message || data.Message || 'NinzaSMS send failed');
  }
}

/**
 * Send OTP via NinzaSMS.
 * @see https://ninzasms.in.net/auth/send_sms
 * @param {string} mobile - Any Indian mobile format
 * @param {string|number} otp - 4–6 digit OTP
 * @param {{ route?: string, message?: string }} [opts]
 */
export async function sendSmsOtp(mobile, otp, opts = {}) {
  const numbers = toIndianMobile10(mobile);
  if (!numbers) {
    throw new Error('Invalid Indian mobile number');
  }

  const authorization = apiKeyHeader();
  if (!authorization) {
    throw new Error('NINZASMS_API_KEY is not configured');
  }

  if (!templateId() && !senderId()) {
    throw new Error('Set NINZASMS_TEMPLATE_ID or NINZASMS_SENDER_ID in environment');
  }

  const payload = buildPayload(numbers, otp, opts);

  const { data } = await axios.post(API_URL, payload, {
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      accept: '*/*',
    },
    timeout: 20_000,
  });

  assertSmsSuccess(data);
  return { ok: true, data };
}
