import { Router } from 'express';
import * as stakingAdmin from '../../controllers/admin/stakingAdminController.js';
import { adminMiddleware } from '../../middleware/adminMiddleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  adminStakesListValidators,
  createPlanValidators,
  updatePlanValidators,
} from '../../validators/stakingValidators.js';

const r = Router();

r.use(adminMiddleware);

r.post('/plans', createPlanValidators, validateRequest, stakingAdmin.createPlan);
r.get('/plans', stakingAdmin.getAllPlans);
r.patch('/plans/:id', updatePlanValidators, validateRequest, stakingAdmin.updatePlan);
r.get('/stakes', adminStakesListValidators, validateRequest, stakingAdmin.getAllStakes);

export default r;
