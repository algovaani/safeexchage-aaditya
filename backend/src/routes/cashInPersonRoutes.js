import { Router } from 'express';
import * as cashInPerson from '../controllers/cashInPersonController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { withdrawSubmitRateLimit } from '../middleware/apiRateLimit.js';
import { submitCashInPersonValidators } from '../validators/cashInPersonValidators.js';

import { cashInPersonProofUpload } from '../middleware/cashInPersonUpload.js';

const r = Router();

r.post(
  '/submit',
  authMiddleware,
  withdrawSubmitRateLimit,
  cashInPersonProofUpload,
  submitCashInPersonValidators,
  validateRequest,
  cashInPerson.submitRequest
);
r.get('/history', authMiddleware, cashInPerson.myRequests);

export default r;
