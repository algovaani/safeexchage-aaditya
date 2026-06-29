import { query } from 'express-validator';

export const datatableQueryValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().isLength({ max: 120 }),
  query('q').optional().trim().isLength({ max: 120 }),
  query('sortBy').optional().trim().isLength({ max: 64 }),
  query('sortDir').optional().isIn(['asc', 'desc']),
  query('sort').optional().isIn(['asc', 'desc']),
  query('export').optional().isIn(['csv', 'xlsx']),
  query('from').optional().isISO8601().withMessage('from must be a valid ISO date'),
  query('to').optional().isISO8601().withMessage('to must be a valid ISO date'),
];

export const adminUsersListValidators = [
  ...datatableQueryValidators,
  query('role').optional().isIn(['user', 'admin', 'system']),
  query('status').optional().isIn(['active', 'blocked']),
];

export const adminKycListValidators = [
  ...datatableQueryValidators,
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
  query('docType').optional().isIn(['passport', 'driving_license', 'national_id']),
];

export const adminOrdersListValidators = [
  ...datatableQueryValidators,
  query('status').optional().isIn(['open', 'partially_filled', 'filled', 'cancelled', 'rejected']),
  query('side').optional().isIn(['buy', 'sell']),
  query('orderType').optional().isIn(['market', 'limit']),
  query('symbol').optional().trim().isLength({ max: 32 }),
];
