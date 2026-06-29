import crypto from 'crypto';
import { User } from '../models/User.js';

const CODE_LENGTH = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeReferralCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function randomReferralCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

export async function generateUniqueReferralCode() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomReferralCode();
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error('Could not generate unique referral code');
}

export async function findUserByReferralCode(code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  return User.findOne({ referralCode: normalized });
}
