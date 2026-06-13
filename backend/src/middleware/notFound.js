import { error } from '../utils/response.js';

export function notFound(req, res) {
  return error(res, `Route ${req.method} ${req.originalUrl} not found`, 404);
}
