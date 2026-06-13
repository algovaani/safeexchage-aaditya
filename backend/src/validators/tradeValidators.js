import { body, query } from 'express-validator';
import mongoose from 'mongoose';

const MIN_MARGIN = 10;

export const joinTradeValidators = [
  body('trade_id')
    .notEmpty()
    .withMessage('trade_id is required')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('trade_id must be a valid id'),
  body('margin_amount')
    .isFloat({ min: MIN_MARGIN })
    .withMessage(`margin_amount must be at least ${MIN_MARGIN} USDT`)
    .toFloat(),
];

export const historyValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
