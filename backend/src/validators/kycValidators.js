import { body } from 'express-validator';

const DOC_TYPES = ['passport', 'driving_license', 'national_id'];

export const submitKycValidators = [
  body('doc_type')
    .trim()
    .notEmpty()
    .withMessage('doc_type is required')
    .isIn(DOC_TYPES)
    .withMessage(`doc_type must be one of: ${DOC_TYPES.join(', ')}`),
];

export const reviewKycValidators = [
  body('action')
    .trim()
    .notEmpty()
    .isIn(['approve', 'reject'])
    .withMessage('action must be approve or reject'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body().custom((_, { req }) => {
    if (req.body.action === 'reject' && !req.body.note?.trim()) {
      throw new Error('note is required when rejecting KYC');
    }
    return true;
  }),
];
