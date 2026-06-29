import { error } from '../utils/response.js';
import { applyCorsHeaders } from '../config/cors.js';
import { isDbConnected } from '../config/db.js';

/** Public read routes that work without MongoDB (CoinGecko prices, health). */
function isDbOptionalPath(path) {
  return path === '/health' || path.startsWith('/market');
}

export function requireDb(req, res, next) {
  if (isDbOptionalPath(req.path)) return next();
  if (isDbConnected()) return next();
  applyCorsHeaders(req, res);
  return error(
    res,
    'Database unavailable. Allow your IP in MongoDB Atlas or run local MongoDB, then restart the backend.',
    503
  );
}
