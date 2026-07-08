import { Router } from 'express';
import * as c from '../../controllers/admin/futuresAdminController.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  futuresSettingsUpdateValidators,
  adminFuturesListValidators,
  adminForceCloseValidators,
} from '../../validators/futuresValidators.js';

const r = Router();

r.get('/overview', c.overview);
r.get('/settings', c.getSettings);
r.put('/settings', futuresSettingsUpdateValidators, validateRequest, c.putSettings);
r.get('/config', c.getPublicConfig);
r.get('/positions', adminFuturesListValidators, validateRequest, c.listPositions);
r.post('/positions/:id/force-close', adminForceCloseValidators, validateRequest, c.forceClose);
r.get('/orders', adminFuturesListValidators, validateRequest, c.listOrders);

export default r;
