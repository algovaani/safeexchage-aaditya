import { Router } from 'express';
import * as m from '../controllers/marketController.js';

const r = Router();

r.get('/prices/live', m.livePrices);
r.get('/prices', m.allPrices);
r.get('/prices/:symbol', m.singlePrice);
r.get('/ticker', m.ticker24h);
r.get('/klines', m.klines);

export default r;
