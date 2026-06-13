import { query } from 'express-validator';

export const transactionListValidators = [
  query('type').optional().isIn(['deposit', 'trade', 'stake', 'all']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
