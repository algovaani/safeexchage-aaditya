import { body, query } from 'express-validator';

const NETWORKS = ['TRC20', 'ERC20', 'BEP20', 'BSC', 'ETH', 'TRX', 'SOL', 'DOGE', 'POLYGON'];

export function isValidTxnHash(txnHash, network) {
  const hash = String(txnHash).trim();
  const n = String(network || '').toUpperCase();
  if (n === 'ERC20' || n === 'BEP20' || n === 'BSC' || n === 'ETH') {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  }
  if (n === 'TRC20' || n === 'TRX') return /^[a-fA-F0-9]{64}$/.test(hash);
  return hash.length >= 8;
}

export const cryptoSubmitValidators = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat(),
  body('currency')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 16 })
    .withMessage('currency must be 2–16 characters'),
  body('txn_hash')
    .trim()
    .notEmpty()
    .withMessage('txn_hash is required'),
  body('network')
    .trim()
    .notEmpty()
    .withMessage('network is required')
    .isLength({ max: 32 }),
  body().custom((_, { req }) => {
    if (!isValidTxnHash(req.body.txn_hash, req.body.network)) {
      throw new Error('Invalid txn_hash format for the selected network');
    }
    return true;
  }),
];

export const fiatSubmitValidators = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat(),
  body('utr_number')
    .trim()
    .notEmpty()
    .withMessage('utr_number is required')
    .isLength({ max: 64 }),
  body('bank_name')
    .trim()
    .notEmpty()
    .withMessage('bank_name is required')
    .isLength({ max: 128 }),
  body('account_number')
    .trim()
    .notEmpty()
    .withMessage('account_number is required')
    .isLength({ max: 64 }),
];

export const verifyDepositValidators = [
  body('action')
    .trim()
    .notEmpty()
    .isIn(['approve', 'reject'])
    .withMessage('action must be approve or reject'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body().custom((_, { req }) => {
    if (req.body.action === 'reject' && !req.body.note?.trim()) {
      throw new Error('note is required when rejecting a deposit');
    }
    return true;
  }),
];

export const adminDepositListValidators = [
  query('type').optional().isIn(['crypto', 'fiat']),
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
  query('from').optional().isISO8601().withMessage('from must be a valid ISO date'),
  query('to').optional().isISO8601().withMessage('to must be a valid ISO date'),
];
