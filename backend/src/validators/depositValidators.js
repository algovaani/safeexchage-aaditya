import { body, query } from 'express-validator';
import { datatableQueryValidators } from './adminListValidators.js';

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
    .withMessage('txn_hash is required')
    .isLength({ min: 8, max: 128 }),
  body('from_address').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('user_wallet_address').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('network')
    .trim()
    .notEmpty()
    .withMessage('network is required')
    .isLength({ max: 32 }),
  body().custom((_, { req }) => {
    const hash = req.body.txn_hash?.trim();
    if (hash && !isValidTxnHash(hash, req.body.network)) {
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
  body('branch').optional({ values: 'falsy' }).trim().isLength({ max: 128 }),
];

export const verifyDepositValidators = [
  body('action')
    .trim()
    .notEmpty()
    .isIn(['approve', 'reject', 'cancel'])
    .withMessage('action must be approve, reject, or cancel'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body().custom((_, { req }) => {
    if (req.body.action === 'reject' && !req.body.note?.trim()) {
      throw new Error('note is required when rejecting a deposit');
    }
    return true;
  }),
];

export const adminDepositListValidators = [
  ...datatableQueryValidators,
  query('type').optional().isIn(['crypto', 'fiat']),
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
  query('chain').optional().isIn(['BNB', 'ETH', 'TRC']),
];

export const userWalletProfileValidators = [
  body('bnbWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('ethWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('trcWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('usdtWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('name').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
];
