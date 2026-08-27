import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';
import { datatableQueryValidators } from './adminListValidators.js';

/** Normalize pasted addresses (spaces, 0X prefix, lowercase T for TRON). */
export function normalizeWalletAddress(address) {
  return String(address || '')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '');
}

export function normalizeWithdrawNetwork(network) {
  const n = String(network || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (['BEP20', 'BSC', 'BNB', 'BINANCE', 'BINANCESMARTCHAIN'].includes(n)) return 'BEP20';
  if (['ERC20', 'ETH', 'ETHEREUM', 'ETHER'].includes(n)) return 'ERC20';
  if (['TRC20', 'TRX', 'TRON'].includes(n)) return 'TRC20';
  if (['POLYGON', 'MATIC', 'POL'].includes(n)) return 'POLYGON';
  if (['SOL', 'SOLANA'].includes(n)) return 'SOL';
  if (['DOGE', 'DOGECOIN'].includes(n)) return 'DOGE';
  return n || '';
}

export function isValidWalletAddress(address, network) {
  let addr = normalizeWalletAddress(address);
  const n = normalizeWithdrawNetwork(network);

  if (!addr) return false;

  // EVM chains accept 0x / 0X
  if (n === 'ERC20' || n === 'BEP20' || n === 'POLYGON' || n === 'ETH' || n === 'BSC') {
    if (/^0X/i.test(addr)) addr = `0x${addr.slice(2)}`;
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  if (n === 'TRC20' || n === 'TRX') {
    // TRON addresses are Base58 and start with T (allow lowercase paste)
    if (addr.startsWith('t')) addr = `T${addr.slice(1)}`;
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
  }

  if (n === 'SOL') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  }

  if (n === 'DOGE') {
    return /^[DA][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr);
  }

  return addr.length >= 10 && addr.length <= 128;
}

function walletAddressError(network) {
  const n = normalizeWithdrawNetwork(network);
  if (n === 'TRC20' || n === 'TRX') {
    return 'Enter a valid TRON address (starts with T, 34 characters)';
  }
  if (n === 'SOL') {
    return 'Enter a valid Solana address';
  }
  if (n === 'DOGE') {
    return 'Enter a valid Dogecoin address';
  }
  if (n === 'ERC20' || n === 'BEP20' || n === 'POLYGON' || n === 'ETH' || n === 'BSC') {
    return 'Enter a valid EVM address (0x + 40 hex characters)';
  }
  return 'Invalid wallet address for the selected network';
}

const MIN_WITHDRAW = Number(process.env.WITHDRAW_MIN_AMOUNT) || 1;
const MAX_WITHDRAW = Number(process.env.WITHDRAW_MAX_AMOUNT) || 100_000;

export const cryptoWithdrawValidators = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat()
    .custom((v) => {
      if (v < MIN_WITHDRAW) throw new Error(`Minimum withdrawal is ${MIN_WITHDRAW} USDT`);
      if (v > MAX_WITHDRAW) throw new Error(`Maximum withdrawal is ${MAX_WITHDRAW} USDT`);
      return true;
    }),
  body('currency')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(['USDT', 'BNB', 'ETH', 'BTC', 'TRX', 'SOL', 'DOGE'])
    .withMessage('Unsupported currency'),
  body('wallet_address')
    .customSanitizer((v) => normalizeWalletAddress(v))
    .notEmpty()
    .withMessage('wallet_address is required')
    .isLength({ max: 128 })
    .withMessage('wallet_address is too long'),
  body('network')
    .customSanitizer((v) => normalizeWithdrawNetwork(v) || String(v || '').trim())
    .notEmpty()
    .withMessage('network is required')
    .isLength({ max: 32 }),
  body('wallet_address').custom((value, { req }) => {
    if (!isValidWalletAddress(value, req.body.network)) {
      throw new Error(walletAddressError(req.body.network));
    }
    return true;
  }),
];

export const fiatWithdrawValidators = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat()
    .custom((v) => {
      if (v < MIN_WITHDRAW) throw new Error(`Minimum withdrawal is ${MIN_WITHDRAW} USDT`);
      if (v > MAX_WITHDRAW) throw new Error(`Maximum withdrawal is ${MAX_WITHDRAW} USDT`);
      return true;
    }),
  body('bank_name')
    .trim()
    .notEmpty()
    .withMessage('bank_name is required')
    .isLength({ max: 128 }),
  body('account_number')
    .trim()
    .notEmpty()
    .withMessage('account_number is required')
    .isLength({ max: 64 })
    .matches(/^[0-9A-Za-z\- ]{6,64}$/)
    .withMessage('Invalid account number'),
  body('ifsc')
    .trim()
    .notEmpty()
    .withMessage('ifsc is required')
    .toUpperCase()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Invalid IFSC code'),
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

export const cancelWithdrawalValidators = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid withdrawal id'),
];

export const editWithdrawalValidators = [
  body('amount')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat(),
  body('currency')
    .optional()
    .trim()
    .isLength({ min: 2, max: 16 })
    .withMessage('currency must be 2–16 characters'),
  body('wallet_address').optional({ values: 'falsy' }).trim().isLength({ max: 128 }),
  body('network').optional({ values: 'falsy' }).trim().isLength({ max: 32 }),
  body('bank_name').optional({ values: 'falsy' }).trim().isLength({ max: 128 }),
  body('account_number').optional({ values: 'falsy' }).trim().isLength({ max: 64 }),
  body('ifsc').optional({ values: 'falsy' }).trim().isLength({ max: 16 }),
  body('account_holder').optional({ values: 'falsy' }).trim().isLength({ max: 128 }),
  body('admin_note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body().custom((_, { req }) => {
    const editable = [
      'amount',
      'currency',
      'wallet_address',
      'network',
      'bank_name',
      'account_number',
      'ifsc',
      'account_holder',
      'admin_note',
    ];
    if (!editable.some((key) => req.body[key] !== undefined)) {
      throw new Error('At least one editable field is required');
    }
    return true;
  }),
];

export const adminWithdrawalListValidators = [
  ...datatableQueryValidators,
  query('type').optional().isIn(['crypto', 'fiat']),
  query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']),
];
