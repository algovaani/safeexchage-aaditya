import { body, param } from 'express-validator';

const STR_MAX = 500;

// ---------------------------
// Banners
// ---------------------------
export const bannerCreateValidators = [
  body('message').trim().notEmpty().isLength({ max: STR_MAX }),
  body('imageUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 }),
  body('enabled').optional({ values: 'falsy' }).isBoolean().toBoolean(),
  body('sortOrder').optional({ values: 'falsy' }).isInt().toInt(),
];

export const bannerUpdateValidators = [
  param('id').isMongoId(),
  body('message').optional({ values: 'falsy' }).trim().isLength({ max: STR_MAX }),
  body('imageUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 }),
  body('enabled').optional({ values: 'falsy' }).isBoolean().toBoolean(),
  body('sortOrder').optional({ values: 'falsy' }).isInt().toInt(),
];

export const bannerDeleteValidators = [param('id').isMongoId()];

// ---------------------------
// Notices
// ---------------------------
export const noticeCreateValidators = [
  body('title').trim().notEmpty().isLength({ max: 120 }),
  body('message').trim().notEmpty().isLength({ max: STR_MAX }),
  body('imageUrl').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }),
  body('enabled').optional({ values: 'falsy' }).isBoolean().toBoolean(),
  body('sortOrder').optional({ values: 'falsy' }).isInt().toInt(),
];

export const noticeUpdateValidators = [
  param('id').isMongoId(),
  body('title').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('message').optional({ values: 'falsy' }).trim().isLength({ max: STR_MAX }),
  body('imageUrl').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }),
  body('enabled').optional({ values: 'falsy' }).isBoolean().toBoolean(),
  body('sortOrder').optional({ values: 'falsy' }).isInt().toInt(),
];

// ---------------------------
// Support Contacts
// ---------------------------
export const noticeDeleteValidators = [param('id').isMongoId()];

export const supportCreateValidators = [
  body('enabled').optional({ values: 'falsy' }).isBoolean().toBoolean(),
  body('name').trim().notEmpty().isLength({ max: 120 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .isLength({ max: 120 }),
];

export const supportUpdateValidators = [
  param('id').isMongoId(),
  body('enabled').optional({ values: 'falsy' }).isBoolean().toBoolean(),
  body('name').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .isLength({ max: 120 }),
];

