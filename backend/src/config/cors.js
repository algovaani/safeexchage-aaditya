import { parseEnvList } from '../utils/env.js';

const isDev = process.env.NODE_ENV !== 'production';

/** Production + local defaults; override with CORS_ORIGIN in .env */
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5177',
  'http://127.0.0.1:5177',
  'https://safexchange.io',
  'https://www.safexchange.io',
];

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

function buildAllowedOrigins() {
  const fromEnv = parseEnvList(
    process.env.CORS_ORIGIN || process.env.FRONTEND_URL || ''
  );
  return new Set([...DEFAULT_ORIGINS, ...fromEnv]);
}

export function createCorsOriginChecker() {
  const allowed = buildAllowedOrigins();

  return function corsOrigin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowed.has(origin)) {
      callback(null, true);
      return;
    }

    if (isDev && isLocalDevOrigin(origin)) {
      callback(null, true);
      return;
    }

    console.warn(`[cors] blocked origin: ${origin} (allowed: ${[...allowed].join(', ')})`);
    callback(null, false);
  };
}

/** Express + Socket.io CORS origin (function works in dev and production). */
export function getCorsAllowedOrigins() {
  return createCorsOriginChecker();
}

export function getCorsAllowedOriginList() {
  return [...buildAllowedOrigins()];
}
