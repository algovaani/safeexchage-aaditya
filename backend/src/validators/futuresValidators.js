import { body, param, query } from 'express-validator';

export const futuresEstimateValidators = [
  body('symbol').trim().notEmpty().withMessage('Symbol is required'),
  body('side').optional().isIn(['long', 'short']),
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be positive'),
  body('leverage').optional().isInt({ min: 1, max: 125 }),
  body('marginMode').optional().isIn(['cross', 'isolated']),
  body('limitPrice').optional().isFloat({ gt: 0 }),
];

export const futuresOpenValidators = [
  body('symbol').trim().notEmpty().withMessage('Symbol is required'),
  body('side').isIn(['long', 'short']).withMessage('Side must be long or short'),
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be positive'),
  body('orderType').optional().isIn(['market', 'limit']),
  body('limitPrice').optional().isFloat({ gt: 0 }),
  body('leverage').optional().isInt({ min: 1, max: 125 }),
  body('marginMode').optional().isIn(['cross', 'isolated']),
  body('takeProfitPrice').optional({ nullable: true }).isFloat({ gt: 0 }),
  body('stopLossPrice').optional({ nullable: true }).isFloat({ gt: 0 }),
];

export const futuresCloseValidators = [
  param('id').isMongoId(),
  body('quantity').optional().isFloat({ gt: 0 }),
];

export const futuresTpSlValidators = [
  param('id').isMongoId(),
  body('takeProfitPrice').optional({ nullable: true }).isFloat({ gt: 0 }),
  body('stopLossPrice').optional({ nullable: true }).isFloat({ gt: 0 }),
];

export const futuresMarginValidators = [
  param('id').isMongoId(),
  body('amount').isFloat({ gt: 0 }),
  body('action').isIn(['add', 'reduce']),
];

export const futuresHistoryValidators = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

export const futuresSettingsUpdateValidators = [
  body('enabled').optional().isBoolean(),
  body('maxLeverage').optional().isInt({ min: 1, max: 125 }),
  body('minLeverage').optional().isInt({ min: 1, max: 125 }),
  body('defaultLeverage').optional().isInt({ min: 1, max: 125 }),
  body('defaultMarginMode').optional().isIn(['cross', 'isolated']),
  body('takerFeeRate').optional().isFloat({ min: 0, max: 0.05 }),
  body('makerFeeRate').optional().isFloat({ min: 0, max: 0.05 }),
  body('maintenanceMarginRate').optional().isFloat({ min: 0.0001, max: 0.5 }),
  body('minOrderNotional').optional().isFloat({ min: 1 }),
  body('maxOrderNotional').optional().isFloat({ min: 10 }),
  body('minQuantity').optional().isFloat({ min: 0.00000001 }),
  body('fundingEnabled').optional().isBoolean(),
  body('fundingRate').optional().isFloat({ min: -0.01, max: 0.01 }),
  body('allowedLeverages').optional().isArray(),
];

export const adminFuturesListValidators = [
  query('status').optional().isIn(['open', 'closed', 'liquidated', 'all']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
];

export const adminForceCloseValidators = [param('id').isMongoId()];
