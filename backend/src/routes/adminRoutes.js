import { Router } from 'express';
import * as a from '../controllers/adminController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { manualPriceSchema } from '../validators/schemas.js';

const r = Router();

r.use(requireAuth, requireAdmin);

r.get('/users', a.listUsers);
r.get('/kyc', a.listKyc);
r.patch('/kyc/:id', a.updateKyc);
r.get('/transactions', a.listPendingTransactions);
r.get('/transactions/all', a.listAllTransactions);
r.patch('/transactions/:id', a.approveTransaction);
r.get('/orders', a.listAllOrders);
r.post('/manual-prices', validateBody(manualPriceSchema), a.upsertManualPrice);
r.get('/manual-prices', a.listManualPrices);
r.delete('/manual-prices/:id', a.deleteManualPrice);
r.get('/trades', a.allTrades);

export default r;
