import { Router } from 'express';
import * as dashboard from '../controllers/dashboardController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const r = Router();

r.use(authMiddleware);

r.get('/summary', dashboard.getSummary);
r.get('/portfolio', dashboard.getPortfolio);

export default r;
