import { error } from '../utils/response.js';

export function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 'Validation failed', 422, parsed.error.flatten());
    }
    req.body = parsed.data;
    next();
  };
}
