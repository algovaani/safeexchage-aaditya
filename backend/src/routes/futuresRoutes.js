import { Router } from 'express';
import * as c from '../controllers/futuresController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  futuresEstimateValidators,
  futuresOpenValidators,
  futuresCloseValidators,
  futuresTpSlValidators,
  futuresMarginValidators,
  futuresHistoryValidators,
} from '../validators/futuresValidators.js';

const r = Router();

r.get('/config', c.getConfig);
r.use(requireAuth);
r.get('/positions', c.getPositions);
r.get('/positions/history', futuresHistoryValidators, validateRequest, c.getPositionHistory);
r.get('/orders', futuresHistoryValidators, validateRequest, c.getOrderHistory);
r.post('/estimate', futuresEstimateValidators, validateRequest, c.postEstimate);
r.post('/open', futuresOpenValidators, validateRequest, c.postOpen);
r.post('/positions/:id/close', futuresCloseValidators, validateRequest, c.postClose);
r.patch('/positions/:id/tpsl', futuresTpSlValidators, validateRequest, c.patchTpSl);
r.patch('/positions/:id/margin', futuresMarginValidators, validateRequest, c.patchMargin);
r.post('/positions/:id/reverse', futuresCloseValidators.slice(0, 1), validateRequest, c.postReverse);

export default r;
