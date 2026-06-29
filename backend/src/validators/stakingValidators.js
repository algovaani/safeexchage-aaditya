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

const planIdValidator = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid plan id'),
];

export const createPlanValidators = [
  body('name').trim().notEmpty().isLength({ max: 120 }),
  body('apy_percent').optional().isFloat({ min: 0.1, max: 500 }).toFloat(),
  body('roi_percent').optional().isFloat({ min: 0.1, max: 500 }).toFloat(),
  body('lock_days').isInt({ min: 1, max: 3650 }).toInt(),
  body('min_amount').isFloat({ gt: 0 }).toFloat(),
  body('max_amount').isFloat({ gt: 0 }).toFloat(),
  body('payout_type').optional().isIn(['end_of_plan', 'daily']),
  body('payout_mode').optional().isIn(['auto', 'manual']),
  body('requires_approval').optional().isBoolean().toBoolean(),
  body().custom((_, { req }) => {
    if (req.body.roi_percent == null && req.body.apy_percent == null) {
      throw new Error('roi_percent or apy_percent is required');
    }
    if (req.body.max_amount <= req.body.min_amount) {
      throw new Error('max_amount must be greater than min_amount');
    }
    return true;
  }),
];

export const updatePlanValidators = [
  ...planIdValidator,
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('apy_percent').optional().isFloat({ min: 0.1, max: 500 }).toFloat(),
  body('roi_percent').optional().isFloat({ min: 0.1, max: 500 }).toFloat(),
  body('min_amount').optional().isFloat({ gt: 0 }).toFloat(),
  body('max_amount').optional().isFloat({ gt: 0 }).toFloat(),
  body('is_active').optional().isBoolean().toBoolean(),
  body('payout_type').optional().isIn(['end_of_plan', 'daily']),
  body('payout_mode').optional().isIn(['auto', 'manual']),
  body('requires_approval').optional().isBoolean().toBoolean(),
];

export const adminStakesListValidators = [
  query('status').optional().isIn(['pending', 'active', 'rejected', 'matured', 'withdrawn', 'all']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const reviewStakeValidators = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid stake id'),
  body('action').isIn(['approve', 'reject']).withMessage('action must be approve or reject'),
  body('note').optional().isString().isLength({ max: 500 }),
];

export const releasePayoutValidators = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid stake id'),
];
