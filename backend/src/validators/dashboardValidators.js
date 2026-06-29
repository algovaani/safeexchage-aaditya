import { query } from 'express-validator';
import { datatableQueryValidators } from './adminListValidators.js';

export const transactionListValidators = [
  ...datatableQueryValidators,
  query('type')
    .optional()
    .isIn(['all', 'deposit', 'withdrawal', 'trade', 'stake', 'buy', 'sell', 'hold']),
  query('status').optional().isIn(['all', 'pending', 'approved', 'rejected', 'completed']),
];
