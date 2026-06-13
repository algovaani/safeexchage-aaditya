import { Router } from 'express';
import * as reports from '../../controllers/admin/reportsAdminController.js';
import { adminMiddleware } from '../../middleware/adminMiddleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  depositReportValidators,
  tradingReportValidators,
} from '../../validators/adminDashboardValidators.js';

const r = Router();

r.use(adminMiddleware);

r.get('/deposits', depositReportValidators, validateRequest, reports.depositReport);
r.get('/trading', tradingReportValidators, validateRequest, reports.tradingReport);

export default r;
