import { body, param, query } from 'express-validator';

const MIN = Number(process.env.WITHDRAW_MIN_AMOUNT) || 1;
const MAX = Number(process.env.WITHDRAW_MAX_AMOUNT) || 100_000;

export const submitCashInPersonValidators = [
  body('mobile').trim().notEmpty().withMessage('Mobile number is required').isLength({ max: 20 }),
  body('city').trim().notEmpty().withMessage('City is required').isLength({ max: 120 }),
  body('type').optional().isIn(['deposit', 'withdraw']).withMessage('Type must be deposit or withdraw'),
  body('amount').custom((value, { req }) => {
    const isWithdraw = req.body?.type === 'withdraw';
    if (!isWithdraw) {
      if (value == null || value === '') return true;
      const n = Number(value);
      if (!(n >= 0)) throw new Error('Amount must be a positive number');
      return true;
    }
    const n = Number(value);
    if (!(n > 0)) throw new Error('Amount is required for withdraw requests');
    if (n < MIN) throw new Error(`Minimum withdrawal is ${MIN} USDT`);
    if (n > MAX) throw new Error(`Maximum withdrawal is ${MAX} USDT`);
    return true;
  }),
];

export const adminCashInPersonListValidators = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 200 }),
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
  query('type').optional().isIn(['deposit', 'withdraw']),
  query('search').optional().isString(),
  query('sortBy').optional().isString(),
  query('sortDir').optional().isIn(['asc', 'desc']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('export').optional().isIn(['csv', '1', 'true']),
];

export const verifyCashInPersonValidators = [
  param('id').isMongoId(),
  body('action').isIn(['approve', 'reject']),
  body('amount')
    .optional({ nullable: true })
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than zero'),
  body('note').optional({ nullable: true }).isString().isLength({ max: 500 }),
];
