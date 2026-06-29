import { param } from 'express-validator';
import mongoose from 'mongoose';
import { datatableQueryValidators } from './adminListValidators.js';

export const adminUserIdParamValidators = [
  param('userId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid user id'),
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
