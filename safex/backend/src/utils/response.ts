import { Request, Response } from 'express';

export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
  errors: null;
  timestamp: string;
};

export type ApiError = {
  success: false;
  message: string;
  data: null;
  errors: unknown;
  timestamp: string;
};

export function success<T>(res: Response, data: T, message = 'OK', status = 200) {
  const body: ApiSuccess<T> = {
    success: true,
    message,
    data,
    errors: null,
    timestamp: new Date().toISOString(),
  };
  return res.status(status).json(body);
}

export function fail(res: Response, message: string, status = 400, errors: unknown = null) {
  const body: ApiError = {
    success: false,
    message,
    data: null,
    errors,
    timestamp: new Date().toISOString(),
  };
  return res.status(status).json(body);
}

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}
