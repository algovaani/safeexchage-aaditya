import { error } from '../utils/response.js';

function duplicateKeyMessage(err) {
  const field = Object.keys(err.keyPattern || {})[0] || 'field';
  const readable = field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
  return `${readable.charAt(0).toUpperCase()}${readable.slice(1)} is already registered`;
}

export function errorHandler(err, _req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err);

  if (err.code === 11000) {
    return error(res, duplicateKeyMessage(err), 409);
  }

  if (err.name === 'JsonWebTokenError') {
    return error(res, 'Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return error(res, 'Token expired', 401);
  }

  if (err.name === 'ValidationError' && err.errors) {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return error(res, 'Validation failed', 422, errors);
  }

  if (err.status === 422 || err.statusCode === 422) {
    return error(res, err.message || 'Validation failed', 422, err.errors || null);
  }

  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message =
    status >= 500
      ? isProd
        ? 'Internal server error'
        : err.message || 'Internal server error'
      : err.message || 'Request failed';

  return error(res, message, status);
}
