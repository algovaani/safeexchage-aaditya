import { Router } from 'express';
import { authMiddleware, kycApprovedMiddleware } from '../middleware/auth.js';
import { placeOrder, myOrders } from '../services/order.service.js';
import type { AuthRequest } from '../utils/response.js';
import { fail, success } from '../utils/response.js';

const router = Router();

router.post('/place', authMiddleware, kycApprovedMiddleware, async (req: AuthRequest, res) => {
  try {
    const { tradeId, margin } = req.body;
    const order = await placeOrder(req.userId!, tradeId, Number(margin));
    return success(res, order, 'Order placed', 201);
  } catch (e: unknown) {
    return fail(res, e instanceof Error ? e.message : 'Order failed', 400);
  }
});

router.get('/my', authMiddleware, async (req: AuthRequest, res) => {
  const orders = await myOrders(req.userId!);
  return success(res, orders, 'Orders fetched');
});

router.get('/open', authMiddleware, async (req: AuthRequest, res) => {
  const orders = await myOrders(req.userId!, true);
  return success(res, orders, 'Open orders');
});

export default router;
