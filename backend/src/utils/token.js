import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { TokenBlacklist } from '../models/TokenBlacklist.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export async function isTokenBlacklisted(token) {
  const tokenHash = hashToken(token);
  const hit = await TokenBlacklist.findOne({ tokenHash }).lean();
  return Boolean(hit);
}

export async function blacklistToken(token) {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) return;

  const expiresAt = new Date(decoded.exp * 1000);
  await TokenBlacklist.updateOne(
    { tokenHash: hashToken(token) },
    { $set: { tokenHash: hashToken(token), expiresAt } },
    { upsert: true }
  );
}
