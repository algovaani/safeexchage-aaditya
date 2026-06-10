import mongoose from 'mongoose';

export function requireDb(req, res, next) {
  if (req.path === '/health') return next();
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    error: 'Database unavailable',
    hint: 'Allow your IP in MongoDB Atlas Network Access (or run local MongoDB), then restart the backend.',
  });
}
