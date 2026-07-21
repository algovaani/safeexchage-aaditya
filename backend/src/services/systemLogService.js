import mongoose from 'mongoose';
import { SystemLog } from '../models/SystemLog.js';

const recentFingerprints = new Map();
const DEDUPE_MS = 30_000;

function fingerprint(level, source, message, location) {
  return `${level}|${source}|${String(message).slice(0, 200)}|${location || ''}`;
}

function shouldSkipDuplicate(fp) {
  const now = Date.now();
  for (const [key, ts] of recentFingerprints) {
    if (now - ts > DEDUPE_MS) recentFingerprints.delete(key);
  }
  const last = recentFingerprints.get(fp);
  if (last && now - last < DEDUPE_MS) return true;
  recentFingerprints.set(fp, now);
  return false;
}

/** First app frame from stack (skip node_modules / node: internals). */
export function parseStackLocation(stack) {
  if (!stack) return '';
  const lines = String(stack).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;
    if (trimmed.includes('node_modules') || trimmed.includes('node:')) continue;
    const abs = trimmed.match(/\(([^)]+):(\d+):(\d+)\)/);
    if (abs) {
      const file = abs[1].replace(/\\/g, '/');
      const short = file.includes('/src/') ? file.split('/src/').pop() : file.split('/').slice(-2).join('/');
      return `${short}:${abs[2]}`;
    }
    const bare = trimmed.match(/at\s+(?:async\s+)?(?:\S+\s+)?([^()\s]+):(\d+):(\d+)/);
    if (bare) {
      const file = bare[1].replace(/\\/g, '/');
      const short = file.includes('/src/') ? file.split('/src/').pop() : file.split('/').slice(-2).join('/');
      return `${short}:${bare[2]}`;
    }
  }
  return '';
}

function normalizeError(errOrReason) {
  if (errOrReason instanceof Error) {
    return {
      message: errOrReason.message || 'Unknown error',
      stack: errOrReason.stack || '',
      name: errOrReason.name || 'Error',
    };
  }
  if (errOrReason && typeof errOrReason === 'object') {
    const message = errOrReason.message || JSON.stringify(errOrReason).slice(0, 2000);
    return { message: String(message), stack: errOrReason.stack || '', name: errOrReason.name || 'Error' };
  }
  return { message: String(errOrReason ?? 'Unknown error'), stack: '', name: 'Error' };
}

/**
 * Persist a system/crash log. Never throws — safe inside process handlers.
 */
export async function recordSystemLog(input = {}) {
  try {
    if (mongoose.connection.readyState !== 1) return null;

    const level = ['fatal', 'error', 'warn'].includes(input.level) ? input.level : 'error';
    const source = input.source || 'service';
    const fromErr = input.error != null ? normalizeError(input.error) : null;
    const message = String(input.message || fromErr?.message || 'Unknown error').slice(0, 4000);
    const stack = String(input.stack || fromErr?.stack || '').slice(0, 20000);
    const location =
      String(input.location || '').trim() ||
      parseStackLocation(stack) ||
      (input.method && input.path ? `${input.method} ${input.path}` : '');

    const fp = fingerprint(level, source, message, location);
    if (shouldSkipDuplicate(fp)) return null;

    const doc = await SystemLog.create({
      level,
      source,
      message,
      stack,
      location: String(location).slice(0, 512),
      method: String(input.method || '').slice(0, 16),
      path: String(input.path || '').slice(0, 512),
      statusCode: Number.isFinite(Number(input.statusCode)) ? Number(input.statusCode) : null,
      userId: input.userId || null,
      ip: String(input.ip || '').slice(0, 64),
      meta: input.meta && typeof input.meta === 'object' ? input.meta : null,
    });
    return doc;
  } catch (err) {
    console.error('[systemLog] failed to persist:', err.message);
    return null;
  }
}

export function formatSystemLog(doc) {
  if (!doc) return null;
  const row = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(row._id),
    level: row.level,
    source: row.source,
    message: row.message,
    stack: row.stack || '',
    location: row.location || '',
    method: row.method || '',
    path: row.path || '',
    statusCode: row.statusCode,
    userId: row.userId ? String(row.userId) : null,
    ip: row.ip || '',
    meta: row.meta || null,
    createdAt: row.createdAt,
  };
}
