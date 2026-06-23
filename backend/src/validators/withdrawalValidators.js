import { body, query } from 'express-validator';

export function isValidWalletAddress(address, network) {
  const addr = String(address).trim();
  const n = String(network || '').toUpperCase();

  if (n === 'ERC20' || n === 'BEP20' || n === 'BSC' || n === 'ETH' || n === 'POLYGON') {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }
  if (n === 'TRC20' || n === 'TRX') {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
  }
  if (n === 'SOL') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  }
  if (n === 'DOGE') {
    return /^[DA][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr);
  }

  return addr.length >= 10;
}

export const cryptoWithdrawValidators = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat(),
  body('currency')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 16 })
    .withMessage('currency must be 2–16 characters'),
  body('wallet_address')
    .trim()
    .notEmpty()
    .withMessage('wallet_address is required')
    .isLength({ max: 128 }),
  body('network')
    .trim()
    .notEmpty()
    .withMessage('network is required')
    .isLength({ max: 32 }),
  body().custom((_, { req }) => {
    if (!isValidWalletAddress(req.body.wallet_address, req.body.network)) {
      throw new Error('Invalid wallet address for the selected network');
    }
    return true;
  }),
];

export const fiatWithdrawValidators = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat(),
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
  body('ifsc')
    .trim()
    .notEmpty()
    .withMessage('ifsc is required')
    .isLength({ max: 16 }),
  body('account_holder')
    .trim()
    .notEmpty()
    .withMessage('account_holder is required')
    .isLength({ max: 128 }),
];

export const verifyWithdrawalValidators = [
  body('action')
    .trim()
    .notEmpty()
    .isIn(['approve', 'reject'])
    .withMessage('action must be approve or reject'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body().custom((_, { req }) => {
    if (req.body.action === 'reject' && !req.body.note?.trim()) {
      throw new Error('note is required when rejecting a withdrawal');
    }
    return true;
  }),
];

export const adminWithdrawalListValidators = [
  query('type').optional().isIn(['crypto', 'fiat']),
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
  query('from').optional().isISO8601().withMessage('from must be a valid ISO date'),
  query('to').optional().isISO8601().withMessage('to must be a valid ISO date'),
];
