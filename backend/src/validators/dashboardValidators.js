import { query } from 'express-validator';
import { datatableQueryValidators } from './adminListValidators.js';

export const transactionListValidators = [
  ...datatableQueryValidators,
  query('type')
    .optional()
    .isIn(['all', 'deposit', 'withdrawal', 'trade', 'spot', 'stake', 'buy', 'sell', 'hold', 'admin', 'futures', 'referral']),
  query('status').optional().isIn(['all', 'pending', 'approved', 'rejected', 'completed']),
];
