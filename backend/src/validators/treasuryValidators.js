import { body, query, param } from 'express-validator';
import { datatableQueryValidators } from './adminListValidators.js';

export const treasuryWithdrawValidators = [
  body('admin_wallet_address')
    .trim()
    .notEmpty()
    .withMessage('admin_wallet_address is required')
    .isLength({ max: 256 }),
  body('outbound_txn_hash')
    .trim()
    .notEmpty()
    .withMessage('outbound_txn_hash is required')
    .isLength({ min: 8, max: 128 }),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

export const treasuryListValidators = [
  ...datatableQueryValidators,
  query('status').optional().isIn(['pending', 'completed']),
  query('currency').optional().isLength({ min: 2, max: 16 }),
];

export const treasurySweepValidators = [
  body('admin_wallet_address').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('fund_gas_first').optional().isBoolean(),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

export const treasuryDepositIdValidators = [
  param('id').isMongoId().withMessage('Invalid deposit id'),
];
