import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';

export const createStakeValidators = [
  body('plan_id')
    .notEmpty()
    .withMessage('plan_id is required')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('plan_id must be a valid id'),
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number')
    .toFloat(),
];

export const stakeIdParamValidator = [
  param('stakeId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid stake id'),
];

export const createPlanValidators = [
  body('name').trim().notEmpty().isLength({ max: 120 }),
  body('apy_percent').isFloat({ min: 1, max: 500 }).toFloat(),
  body('lock_days').isInt({ min: 1, max: 3650 }).toInt(),
  body('min_amount').isFloat({ gt: 0 }).toFloat(),
  body('max_amount').isFloat({ gt: 0 }).toFloat(),
  body().custom((_, { req }) => {
    if (req.body.max_amount <= req.body.min_amount) {
      throw new Error('max_amount must be greater than min_amount');
    }
    return true;
  }),
];

export const updatePlanValidators = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid plan id'),
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('apy_percent').optional().isFloat({ min: 1, max: 500 }).toFloat(),
  body('min_amount').optional().isFloat({ gt: 0 }).toFloat(),
  body('max_amount').optional().isFloat({ gt: 0 }).toFloat(),
  body('is_active').optional().isBoolean().toBoolean(),
];

export const adminStakesListValidators = [
  query('status').optional().isIn(['active', 'matured', 'withdrawn', 'all']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
