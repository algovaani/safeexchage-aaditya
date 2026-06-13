import { validationResult } from 'express-validator';
import { error } from '../utils/response.js';

export function validateRequest(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return error(res, 'Validation failed', 422, result.array());
  }
  return next();
}
