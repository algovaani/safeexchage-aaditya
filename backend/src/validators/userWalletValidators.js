import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';
import { roundMoney } from '../utils/money.js';

export const adjustUserFundsValidators = [
  param('userId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid user id'),
  body('action')
    .isIn(['add', 'deduct'])
    .withMessage('action must be add or deduct'),
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .customSanitizer((v) => roundMoney(v)),
  body('remark')
    .trim()
    .notEmpty()
    .withMessage('remark is required')
    .isLength({ max: 500 })
    .withMessage('remark must be at most 500 characters'),
];

export const userFundHistoryValidators = [
  param('userId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid user id'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
