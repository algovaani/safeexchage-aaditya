import mongoose from 'mongoose';
import { error } from '../utils/response.js';

export function requireDb(req, res, next) {
  if (req.path === '/health') return next();
  if (mongoose.connection.readyState === 1) return next();
  return error(
    res,
    'Database unavailable. Allow your IP in MongoDB Atlas or run local MongoDB, then restart the backend.',
    503
  );
}
