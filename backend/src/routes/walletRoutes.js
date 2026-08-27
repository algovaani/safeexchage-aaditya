import { Router } from 'express';
import * as w from '../controllers/walletController.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.use(requireAuth);

r.get('/balance', w.balance);
// Legacy deposit/withdraw permanently disabled (return 410) — use /deposit and /withdrawal routes
r.post('/deposit', w.deposit);
r.post('/withdraw', w.withdraw);
r.get('/transactions', w.transactions);

export default r;
