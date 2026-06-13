import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';

export const createTradeValidators = [
  body('pair_id')
    .notEmpty()
    .withMessage('pair_id is required')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('pair_id must be a valid id'),
  body('entry_price')
    .isFloat({ gt: 0 })
    .withMessage('entry_price must be a positive number')
    .toFloat(),
  body('take_profit')
    .isFloat({ gt: 0 })
    .withMessage('take_profit must be a positive number')
    .toFloat(),
  body('stop_loss')
    .isFloat({ gt: 0 })
    .withMessage('stop_loss must be a positive number')
    .toFloat(),
  body('leverage')
    .isInt({ min: 1, max: 100 })
    .withMessage('leverage must be between 1 and 100')
    .toInt(),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body().custom((_, { req }) => {
    const { entry_price, take_profit, stop_loss } = req.body;
    if (take_profit <= entry_price) {
      throw new Error('take_profit must be greater than entry_price');
    }
    if (stop_loss >= entry_price) {
      throw new Error('stop_loss must be less than entry_price');
    }
    return true;
  }),
];

export const listTradesValidators = [
  query('status').optional().isIn(['open', 'closed', 'cancelled', 'all']),
  query('pair_id')
    .optional()
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('pair_id must be a valid id'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const tradeIdParamValidator = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid trade id'),
];

export const updateTradeStatusValidators = [
  ...tradeIdParamValidator,
  body('action')
    .trim()
    .notEmpty()
    .isIn(['close', 'cancel'])
    .withMessage('action must be close or cancel'),
  body('close_price')
    .optional({ values: 'falsy' })
    .isFloat({ gt: 0 })
    .withMessage('close_price must be a positive number')
    .toFloat(),
  body().custom((_, { req }) => {
    if (req.body.action === 'close' && (req.body.close_price == null || req.body.close_price <= 0)) {
      throw new Error('close_price is required when action is close');
    }
    return true;
  }),
];
