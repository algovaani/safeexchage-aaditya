import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listOpenTrades } from '../services/trade.service.js';
import { walletTransactions } from '../services/admin.service.js';
import { getBalance } from '../services/wallet.service.js';
import type { AuthRequest } from '../utils/response.js';
import { success } from '../utils/response.js';

const router = Router();

router.get('/trades/open', authMiddleware, async (_req, res) => {
  const trades = await listOpenTrades();
  return success(res, trades, 'Open trades');
});

router.get('/transactions', authMiddleware, async (req: AuthRequest, res) => {
  const data = await walletTransactions(
    req.userId!,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20
  );
  return success(res, data, 'Transactions');
});

router.get('/summary', authMiddleware, async (req: AuthRequest, res) => {
  const balance = await getBalance(req.userId!);
  return success(res, balance, 'Summary');
});

export default router;
