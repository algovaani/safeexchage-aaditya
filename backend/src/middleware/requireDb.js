import mongoose from 'mongoose';
import { error } from '../utils/response.js';

/** Public read routes that work without MongoDB (Binance prices, health). */
function isDbOptionalPath(path) {
  return path === '/health' || path.startsWith('/market');
}

export function requireDb(req, res, next) {
  if (isDbOptionalPath(req.path)) return next();
  if (mongoose.connection.readyState === 1) return next();
  return error(
    res,
    'Database unavailable. Allow your IP in MongoDB Atlas or run local MongoDB, then restart the backend.',
    503
  );
}
