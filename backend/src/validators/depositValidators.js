import { body, query } from 'express-validator';

const NETWORKS = ['TRC20', 'ERC20'];

export function isValidTxnHash(txnHash, network) {
  const hash = String(txnHash).trim();
  if (network === 'ERC20') return /^0x[a-fA-F0-9]{64}$/.test(hash);
  if (network === 'TRC20') return /^[a-fA-F0-9]{64}$/.test(hash);
  return false;
}

export const cryptoSubmitValidators = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat(),
  body('txn_hash')
    .trim()
    .notEmpty()
    .withMessage('txn_hash is required'),
  body('network')
    .trim()
    .isIn(NETWORKS)
    .withMessage(`network must be one of: ${NETWORKS.join(', ')}`),
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
  body('utr_number').optional({ values: 'falsy' }).trim().isLength({ max: 64 }),
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
