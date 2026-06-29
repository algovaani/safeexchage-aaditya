import { parseEnvList } from '../utils/env.js';

const isDev = process.env.NODE_ENV !== 'production';

/** Production + local defaults; extend with CORS_ORIGIN in .env */
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5177',
  'http://127.0.0.1:5177',
  'https://safexchange.io',
  'https://www.safexchange.io',
  'http://safexchange.io',
  'http://www.safexchange.io',
];

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '');
}

/** Allow any local Vite/React dev server origin in development. */
function isLocalDevOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      (hostname === 'localhost' || hostname === '127.0.0.1') &&
      (protocol === 'http:' || protocol === 'https:')
    );
  } catch {
    return false;
  }
}

/** Production site: safexchange.io and subdomains (www, app, etc.). */
function isSafexchangeOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return hostname === 'safexchange.io' || hostname.endsWith('.safexchange.io');
  } catch {
    return false;
  }
}

function buildAllowedOrigins() {
  const fromEnv = parseEnvList(
    process.env.CORS_ORIGIN || process.env.FRONTEND_URL || ''
  );
  const normalized = [...DEFAULT_ORIGINS, ...fromEnv].map(normalizeOrigin).filter(Boolean);
  return new Set(normalized);
}

const allowedOrigins = buildAllowedOrigins();

export function isOriginAllowed(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return true;

  if (allowedOrigins.has(normalized)) return true;
  if (isDev && isLocalDevOrigin(normalized)) return true;
  if (isSafexchangeOrigin(normalized)) return true;

  return false;
}

export function createCorsOriginChecker() {
  return function corsOrigin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    console.warn(
      `[cors] blocked origin: ${origin} (allowed: ${[...allowedOrigins].join(', ')})`
    );
    callback(null, false);
  };
}

/** Express + Socket.io CORS origin (function works in dev and production). */
export function getCorsAllowedOrigins() {
  return createCorsOriginChecker();
}

export function getCorsAllowedOriginList() {
  return [...allowedOrigins];
}

/** Early middleware — ensures preflight always gets CORS headers when origin is allowed. */
export function corsPreflightMiddleware(req, res, next) {
  const origin = normalizeOrigin(req.headers.origin);
  if (!origin || !isOriginAllowed(origin)) {
    return next();
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

export function logCorsConfig() {
  console.log(
    `[cors] allowed origins: ${[...allowedOrigins].join(', ')} (+ *.safexchange.io in production)`
  );
}

/** Attach CORS headers on error responses (backup when upstream proxy strips them). */
export function applyCorsHeaders(req, res) {
  const origin = normalizeOrigin(req.headers.origin);
  if (!origin || !isOriginAllowed(origin) || res.headersSent) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}
