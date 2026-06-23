import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../utils/response.js';
import { getBalance } from '../services/wallet.service.js';
import { success } from '../utils/response.js';

const router = Router();

router.get('/balance', authMiddleware, async (req: AuthRequest, res) => {
  const bal = await getBalance(req.userId!);
  return success(res, {
    balance: bal.balance.toString(),
    lockedBalance: bal.lockedBalance.toString(),
    total: bal.total.toString(),
  });
});

export default router;
