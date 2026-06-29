import { body } from 'express-validator';

export const platformSettingsValidators = [
  body('bnbWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('ethWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('usdtWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('trcWalletAddress').optional({ values: 'falsy' }).trim().isLength({ max: 256 }),
  body('depositMode').optional({ values: 'falsy' }).isIn(['manual', 'auto']),
  body('bankName').optional({ values: 'falsy' }).trim().isLength({ max: 128 }),
  body('bankAccountNumber').optional({ values: 'falsy' }).trim().isLength({ max: 64 }),
  body('bankIfsc').optional({ values: 'falsy' }).trim().isLength({ max: 32 }),
  body('bankBranch').optional({ values: 'falsy' }).trim().isLength({ max: 128 }),
  body('bankAccountHolder').optional({ values: 'falsy' }).trim().isLength({ max: 128 }),
  body('bnbPrivateKey').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 512 }),
  body('ethPrivateKey').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 512 }),
  body('trcPrivateKey').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 512 }),
  body('evmMnemonic').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 1024 }),
  body('referralRewardUsdt').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1_000_000 }),
];
