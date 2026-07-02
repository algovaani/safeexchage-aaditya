import { body } from 'express-validator';
import { isEmailIdentifier } from '../utils/identifier.js';

const INDIAN_MOBILE_REGEX = /^(\+?91)?[6-9]\d{9}$/;

function mobileValidator(field = 'mobile') {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('Mobile number is required')
    .custom((value) => {
      const digits = String(value).replace(/\D/g, '');
      const ten =
        digits.length === 10
          ? digits
          : digits.length === 12 && digits.startsWith('91')
            ? digits.slice(2)
            : '';
      if (!/^[6-9]\d{9}$/.test(ten)) {
        throw new Error('Invalid Indian mobile number (10 digits)');
      }
      return true;
    });
}

const otpValidator = body('otp')
  .trim()
  .matches(/^\d{6}$/)
  .withMessage('OTP must be a 6-digit code');

export const sendOtpValidators = [
  mobileValidator('mobile'),
  body('purpose')
    .trim()
    .isIn(['login', 'register'])
    .withMessage('Purpose must be login or register'),
];

export const resendOtpValidators = sendOtpValidators;

export const registerValidators = [
  mobileValidator('mobile'),
  otpValidator,
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('referralCode')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 4, max: 16 })
    .withMessage('Referral code must be 4–16 characters'),
  body('referral')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 4, max: 16 })
    .withMessage('Referral code must be 4–16 characters'),
];

export const loginValidators = [
  mobileValidator('mobile'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const adminLoginValidators = [
  body('email').trim().isEmail().withMessage('Valid admin email is required').normalizeEmail(),
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
      } else if (!INDIAN_MOBILE_REGEX.test(value.replace(/[\s-]/g, ''))) {
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
  otpValidator,
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters'),
];