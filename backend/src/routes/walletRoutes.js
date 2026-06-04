import { Router } from 'express';
import * as w from '../controllers/walletController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { depositSchema, withdrawSchema } from '../validators/schemas.js';

const r = Router();

r.use(requireAuth);

r.get('/balance', w.balance);
r.post('/deposit', validateBody(depositSchema), w.deposit);
r.post('/withdraw', validateBody(withdrawSchema), w.withdraw);
r.get('/transactions', w.transactions);

export default r;
