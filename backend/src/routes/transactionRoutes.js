import { Router } from 'express';
import * as transactions from '../controllers/transactionController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { transactionListValidators } from '../validators/dashboardValidators.js';

const r = Router();

r.use(authMiddleware);

r.get('/', transactionListValidators, validateRequest, transactions.listTransactions);

export default r;
