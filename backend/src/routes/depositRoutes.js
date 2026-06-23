import { Router } from 'express';
import multer from 'multer';
import * as deposit from '../controllers/depositController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { fiatProofUpload, removeFiatProof } from '../middleware/fiatDepositUpload.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  cryptoSubmitValidators,
  fiatSubmitValidators,
} from '../validators/depositValidators.js';
import { error } from '../utils/response.js';

const depositRouter = Router();
const depositsRouter = Router();

function handleFiatUpload(req, res, next) {
  fiatProofUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      removeFiatProof(req.file);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, 'payment_proof too large. Maximum size is 5MB.', 400);
      }
      return error(res, err.message, 400);
    }
    if (err) {
      removeFiatProof(req.file);
      return error(res, err.message, 400);
    }
    return next();
  });
}

depositRouter.get('/platform-info', authMiddleware, deposit.platformInfo);
depositRouter.get('/crypto/address', authMiddleware, deposit.cryptoAddress);
depositRouter.post(
  '/crypto/submit',
  authMiddleware,
  cryptoSubmitValidators,
  validateRequest,
  deposit.submitCrypto
);
depositRouter.post(
  '/fiat/submit',
  authMiddleware,
  handleFiatUpload,
  fiatSubmitValidators,
  validateRequest,
  deposit.submitFiat
);

depositsRouter.get('/history', authMiddleware, deposit.history);

export { depositRouter, depositsRouter };
