import { Router } from 'express';
import * as trade from '../controllers/tradeController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { historyValidators, joinTradeValidators } from '../validators/tradeValidators.js';

const r = Router();

r.use(authMiddleware);

r.get('/open', trade.getOpenTrades);
r.post('/join', joinTradeValidators, validateRequest, trade.joinTrade);
r.get('/positions/open', trade.getOpenPositions);
r.get('/positions/history', historyValidators, validateRequest, trade.getTradeHistory);

export default r;
