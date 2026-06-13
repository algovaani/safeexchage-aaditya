import { parseEnvList } from '../utils/env.js';

const isDev = process.env.NODE_ENV !== 'production';

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

export function createCorsOriginChecker() {
  const allowed = new Set(
    parseEnvList(process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173')
  );

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

    callback(new Error(`CORS blocked origin: ${origin}`));
  };
}

export function getCorsAllowedOrigins() {
  const origins = parseEnvList(
    process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173'
  );
  if (isDev) {
    return createCorsOriginChecker();
  }
  return origins;
}
