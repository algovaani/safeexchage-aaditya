import { query } from 'express-validator';
import { datatableQueryValidators } from './adminListValidators.js';

export const adminSystemLogListValidators = [
  ...datatableQueryValidators,
  query('level').optional().isIn(['fatal', 'error', 'warn']),
  query('source').optional().isIn([
    'uncaughtException',
    'unhandledRejection',
    'http',
    'process',
    'service',
  ]),
];

export const clearSystemLogsValidators = [
  query('days').optional().isFloat({ min: 0, max: 3650 }).toFloat(),
];
