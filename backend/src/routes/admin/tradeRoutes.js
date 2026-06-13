import { Router } from 'express';
import * as trade from '../../controllers/admin/tradeController.js';
import { adminMiddleware } from '../../middleware/adminMiddleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  createTradeValidators,
  listTradesValidators,
  tradeIdParamValidator,
  updateTradeStatusValidators,
} from '../../validators/adminTradeValidators.js';

const r = Router();

r.use(adminMiddleware);

r.post('/', createTradeValidators, validateRequest, trade.createTrade);
r.get('/', listTradesValidators, validateRequest, trade.getAllTrades);
r.get('/:id/orders', tradeIdParamValidator, validateRequest, trade.getTradeOrders);
r.patch('/:id/status', updateTradeStatusValidators, validateRequest, trade.updateTradeStatus);
r.get('/:id', tradeIdParamValidator, validateRequest, trade.getTradeById);

export default r;
