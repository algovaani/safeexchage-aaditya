import { Router } from 'express';
import * as cashInPerson from '../controllers/cashInPersonController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { submitCashInPersonValidators } from '../validators/cashInPersonValidators.js';

const r = Router();

r.post('/submit', authMiddleware, submitCashInPersonValidators, validateRequest, cashInPerson.submitRequest);
r.get('/history', authMiddleware, cashInPerson.myRequests);

export default r;
