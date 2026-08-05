import { param, body } from 'express-validator';
import mongoose from 'mongoose';
import { datatableQueryValidators } from './adminListValidators.js';

export const adminUserIdParamValidators = [
  param('userId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid user id'),
];

export const adminSetUserPasswordValidators = [
  ...adminUserIdParamValidators,
  body('password')
    .trim()
    .notEmpty()
    .withMessage('password is required')
    .isLength({ min: 6, max: 128 })
    .withMessage('password must be 6–128 characters'),
];

export const adminSetUserSupportAccessValidators = [
  ...adminUserIdParamValidators,
  body('showSupportContactDetails').isBoolean().toBoolean(),
];

export const adminUserDepositsValidators = [
  ...adminUserIdParamValidators,
  ...datatableQueryValidators,
];

export const adminUserWithdrawalsValidators = [
  ...adminUserIdParamValidators,
  ...datatableQueryValidators,
];

export const adminUserTradesValidators = [
  ...adminUserIdParamValidators,
  ...datatableQueryValidators,
];

export const adminUserOrdersValidators = [
  ...adminUserIdParamValidators,
  ...datatableQueryValidators,
];

export const adminUserReferralsValidators = [
  ...adminUserIdParamValidators,
  ...datatableQueryValidators,
];
