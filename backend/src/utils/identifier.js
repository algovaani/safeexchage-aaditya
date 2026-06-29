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

/** Indian mobile as stored in DB: +91 + 10 digits */
export function normalizeIndianMobile(mobile) {
  const ten = toIndianMobile10(mobile);
  return ten ? `91${ten}` : '';
}

/** Ten-digit Indian mobile for NinzaSMS (e.g. 9876543210) */
export function toIndianMobile10(mobile) {
  let digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : '';
}

export function isEmailIdentifier(value) {
  return String(value).includes('@');
}

export function normalizeIdentifier(identifier) {
  const raw = String(identifier).trim();
  return isEmailIdentifier(raw) ? normalizeEmail(raw) : normalizeMobile(raw);
}

/** Match legacy +91 / 91 / 10-digit mobile values in MongoDB */
export function mobileLookupVariants(mobile) {
  const ten = toIndianMobile10(mobile);
  if (!ten) return [];
  return [...new Set([`91${ten}`, `+91${ten}`, ten])];
}

export function findUserByMobile(mobile) {
  const variants = mobileLookupVariants(mobile);
  if (!variants.length) return null;
  return User.findOne({ mobile: { $in: variants } });
}

export function findUserByIdentifier(identifier) {
  const raw = String(identifier).trim();
  if (isEmailIdentifier(raw)) {
    return User.findOne({ email: normalizeEmail(raw) });
  }
  return findUserByMobile(raw);
}
