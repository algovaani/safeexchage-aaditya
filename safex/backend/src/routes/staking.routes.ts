import { Router } from 'express';
import { authMiddleware, kycApprovedMiddleware } from '../middleware/auth.js';
import { listPlans, createStake, myStakes, withdrawStake } from '../services/staking.service.js';
import type { AuthRequest } from '../utils/response.js';
import { paramId } from '../utils/params.js';
import { fail, success } from '../utils/response.js';

const router = Router();

router.get('/plans', async (_req, res) => {
  const plans = await listPlans();
  return success(res, plans, 'Staking plans');
});

router.post('/stake', authMiddleware, kycApprovedMiddleware, async (req: AuthRequest, res) => {
  try {
    const stake = await createStake(req.userId!, req.body.planId, Number(req.body.amount));
    return success(res, stake, 'Staked', 201);
  } catch (e: unknown) {
    return fail(res, e instanceof Error ? e.message : 'Stake failed', 400);
  }
});

router.get('/my', authMiddleware, async (req: AuthRequest, res) => {
  const stakes = await myStakes(req.userId!);
  return success(res, stakes, 'My stakes');
});

router.post('/withdraw/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const early = req.body.early === true;
    const stake = await withdrawStake(req.userId!, paramId(req.params.id), early);
    return success(res, stake, 'Withdrawn');
  } catch (e: unknown) {
    return fail(res, e instanceof Error ? e.message : 'Withdraw failed', 400);
  }
});

export default router;
