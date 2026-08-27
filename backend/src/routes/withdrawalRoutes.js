import { Router } from 'express';
import * as withdrawal from '../controllers/withdrawalController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { withdrawSubmitRateLimit } from '../middleware/apiRateLimit.js';
import {
  cryptoWithdrawValidators,
  fiatWithdrawValidators,
  cancelWithdrawalValidators,
} from '../validators/withdrawalValidators.js';

const withdrawalRouter = Router();
const withdrawalsRouter = Router();

withdrawalRouter.post(
  '/crypto/submit',
  authMiddleware,
  withdrawSubmitRateLimit,
  cryptoWithdrawValidators,
  validateRequest,
  withdrawal.submitCrypto
);
withdrawalRouter.post(
  '/fiat/submit',
  authMiddleware,
  withdrawSubmitRateLimit,
  fiatWithdrawValidators,
  validateRequest,
  withdrawal.submitFiat
);

withdrawalsRouter.get('/history', authMiddleware, withdrawal.history);
withdrawalsRouter.post(
  '/:id/cancel',
  authMiddleware,
  cancelWithdrawalValidators,
  validateRequest,
  withdrawal.cancel
);

export { withdrawalRouter, withdrawalsRouter };
