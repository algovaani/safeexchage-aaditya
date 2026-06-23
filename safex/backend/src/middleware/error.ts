import { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/response.js';

export function notFound(_req: Request, res: Response) {
  return fail(res, 'Route not found', 404);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  return fail(res, message, 500);
}
