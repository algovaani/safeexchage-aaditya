import { Router } from 'express';
import * as staking from '../controllers/stakingController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  createStakeValidators,
  stakeIdParamValidator,
} from '../validators/stakingValidators.js';

const r = Router();

r.get('/plans', staking.getPlans);
r.use(authMiddleware);
r.post('/stake', createStakeValidators, validateRequest, staking.createStake);
r.get('/portfolio', staking.getPortfolio);
r.post('/withdraw/:stakeId', stakeIdParamValidator, validateRequest, staking.withdrawStake);

export default r;
