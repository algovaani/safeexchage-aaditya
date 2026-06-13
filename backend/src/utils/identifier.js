import { User } from '../models/User.js';

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/** Strip spaces; keep leading + for E.164-style numbers */
export function normalizeMobile(mobile) {
  const raw = String(mobile).trim().replace(/[\s-]/g, '');
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  return raw.replace(/\D/g, '');
}

export function isEmailIdentifier(value) {
  return String(value).includes('@');
}

export function normalizeIdentifier(identifier) {
  const raw = String(identifier).trim();
  return isEmailIdentifier(raw) ? normalizeEmail(raw) : normalizeMobile(raw);
}

export function findUserByIdentifier(identifier) {
  const raw = String(identifier).trim();
  if (isEmailIdentifier(raw)) {
    return User.findOne({ email: normalizeEmail(raw) });
  }
  return User.findOne({ mobile: normalizeMobile(raw) });
}
