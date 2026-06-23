import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { fail } from '../utils/response.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 'Validation failed', 422, parsed.error.flatten());
    }
    req.body = parsed.data;
    next();
  };
}
