import { Router } from 'express';
import { getAllPrices, getPrice } from '../services/binance.service.js';
import { fail, success } from '../utils/response.js';

const router = Router();

router.get('/prices', (_req, res) => success(res, getAllPrices(), 'Prices'));
router.get('/prices/:symbol', (req, res) => {
  const tick = getPrice(req.params.symbol);
  if (!tick) return fail(res, 'Symbol not found', 404);
  return success(res, tick, 'Price');
});

export default router;
