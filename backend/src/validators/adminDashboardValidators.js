import { query } from 'express-validator';

export const depositReportValidators = [
  query('start_date').optional().isISO8601().withMessage('start_date must be a valid ISO date'),
  query('end_date').optional().isISO8601().withMessage('end_date must be a valid ISO date'),
  query('type').optional().isIn(['crypto', 'fiat']),
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
];

export const tradingReportValidators = [
  query('start_date').optional().isISO8601().withMessage('start_date must be a valid ISO date'),
  query('end_date').optional().isISO8601().withMessage('end_date must be a valid ISO date'),
];
