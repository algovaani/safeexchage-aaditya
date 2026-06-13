import { body } from 'express-validator';
import { isEmailIdentifier } from '../utils/identifier.js';

const MOBILE_REGEX = /^\+?[1-9]\d{9,14}$/;

export const registerValidators = [
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('mobile')
    .optional({ values: 'falsy' })
    .trim()
    .matches(MOBILE_REGEX)
    .withMessage('Invalid mobile number (10–15 digits, optional + prefix)'),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body().custom((_, { req }) => {
    if (!req.body.email && !req.body.mobile) {
      throw new Error('Either email or mobile is required');
    }
    return true;
  }),
];

export const loginValidators = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or mobile is required')
    .custom((value) => {
      if (isEmailIdentifier(value)) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new Error('Invalid email format');
        }
      } else if (!MOBILE_REGEX.test(value.replace(/[\s-]/g, ''))) {
        throw new Error('Invalid mobile format');
      }
      return true;
    }),
  body('password').notEmpty().withMessage('Password is required'),
];

export const forgotPasswordValidators = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or mobile is required')
    .custom((value) => {
      if (isEmailIdentifier(value)) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new Error('Invalid email format');
        }
      } else if (!MOBILE_REGEX.test(value.replace(/[\s-]/g, ''))) {
        throw new Error('Invalid mobile format');
      }
      return true;
    }),
];

export const resetPasswordValidators = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or mobile is required'),
  body('otp')
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('OTP must be a 6-digit code'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters'),
];
