import { Router } from 'express';
import * as m from '../controllers/marketController.js';

const r = Router();

r.get('/ticker', m.ticker24h);
r.get('/klines', m.klines);

export default r;
