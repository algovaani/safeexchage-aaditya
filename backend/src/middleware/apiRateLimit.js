import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

function apiRateLimitResponse(res, message) {
  return res.status(429).json({
    success: false,
    message,
    data: null,
    errors: null,
    timestamp: new Date().toISOString(),
  });
}

/** Paths polled frequently by the trading UI — excluded from the global API bucket. */
function isHighFrequencyPublicPath(url = '') {
  return (
    /^\/api\/market\//.test(url) ||
    url === '/api/health' ||
    url.startsWith('/api/config')
  );
}

function shouldSkipRateLimit(req) {
  if (req.method === 'OPTIONS') return true;
  const url = req.originalUrl || req.url || '';
  if (/\/auth\/otp\//.test(url)) return true;
  if (isHighFrequencyPublicPath(url)) return true;
  if (isDev && process.env.API_RATE_LIMIT_ENFORCE !== '1') return true;
  return false;
}

const defaultMax = isDev ? 10_000 : 3_000;

export const globalApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX) || defaultMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) =>
    apiRateLimitResponse(
      res,
      'Too many requests. Please wait a few minutes and try again.'
    ),
});

/** Brute-force protection for password login — separate from the global API bucket. */
export const authLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX) || (isDev ? 100 : 30),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev && process.env.API_RATE_LIMIT_ENFORCE !== '1',
  handler: (_req, res) =>
    apiRateLimitResponse(
      res,
      'Too many login attempts. Please wait 15 minutes and try again.'
    ),
});

/**
 * Strict limit on withdraw / cash-in-person withdraw submits.
 * Always enforced (including local) so Postman spam cannot flood pending queue.
 */
export const withdrawSubmitRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.WITHDRAW_RATE_LIMIT_MAX) || (isDev ? 20 : 5),
  standardHeaders: true,
  legacyHeaders: false,
  // userId is set by authMiddleware which runs before this limiter
  keyGenerator: (req) => `wd:${req.userId || req.ip}`,
  validate: false,
  handler: (_req, res) =>
    apiRateLimitResponse(
      res,
      'Too many withdrawal requests. Please wait before trying again.'
    ),
});
