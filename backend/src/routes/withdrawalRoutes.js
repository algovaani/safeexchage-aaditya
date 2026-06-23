import { Router } from 'express';
import * as withdrawal from '../controllers/withdrawalController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  cryptoWithdrawValidators,
  fiatWithdrawValidators,
} from '../validators/withdrawalValidators.js';

const withdrawalRouter = Router();
const withdrawalsRouter = Router();

withdrawalRouter.post(
  '/crypto/submit',
  authMiddleware,
  cryptoWithdrawValidators,
  validateRequest,
  withdrawal.submitCrypto
);
withdrawalRouter.post(
  '/fiat/submit',
  authMiddleware,
  fiatWithdrawValidators,
  validateRequest,
  withdrawal.submitFiat
);

withdrawalsRouter.get('/history', authMiddleware, withdrawal.history);

export { withdrawalRouter, withdrawalsRouter };
