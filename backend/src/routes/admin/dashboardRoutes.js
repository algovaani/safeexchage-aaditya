import { Router } from 'express';
import * as dashboard from '../../controllers/admin/dashboardAdminController.js';
import { adminMiddleware } from '../../middleware/adminMiddleware.js';

const r = Router();

r.use(adminMiddleware);

r.get('/stats', dashboard.getStats);
r.get('/recent', dashboard.getRecent);

export default r;
