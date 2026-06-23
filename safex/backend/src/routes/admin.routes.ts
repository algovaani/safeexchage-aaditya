import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import {
  listKycAdmin,
  getKycById,
  approveKyc,
  rejectKyc,
} from '../services/kyc.service.js';
import {
  listDepositsAdmin,
  approveDeposit,
  rejectDeposit,
  depositStats,
} from '../services/deposit.service.js';
import {
  createTrade,
  listTradesAdmin,
  updateTrade,
  cancelTrade,
} from '../services/trade.service.js';
import { settleOrder } from '../services/order.service.js';
import {
  createPlan,
  updatePlan,
  allStakesAdmin,
} from '../services/staking.service.js';
import {
  adminLogin,
  listUsers,
  getUserDetail,
  toggleUserBlock,
  adjustBalance,
  dashboardStats,
  getSettings,
  updateSettings,
} from '../services/admin.service.js';
import { prisma } from '../lib/prisma.js';
import type { AuthRequest } from '../utils/response.js';
import { fail, success } from '../utils/response.js';
import { paramId } from '../utils/params.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const data = await adminLogin(
      req.body.email,
      req.body.password,
      req.body.otp,
      req.headers['user-agent'] as string,
      req.ip
    );
    return success(res, data, data.otpSent ? 'OTP sent' : 'Admin login successful');
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return fail(res, err.message || 'Login failed', err.status || 401);
  }
});

router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', async (_req, res) => {
  const stats = await dashboardStats();
  return success(res, stats, 'Admin dashboard');
});

// KYC
router.get('/kyc', async (req, res) => {
  const data = await listKycAdmin(
    req.query.status as string,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20
  );
  return success(res, data, 'KYC list');
});

router.get('/kyc/:id', async (req, res) => {
  const kyc = await getKycById(paramId(req.params.id));
  return success(res, kyc, 'KYC detail');
});

router.post('/kyc/:id/approve', async (req: AuthRequest, res) => {
  const kyc = await approveKyc(paramId(req.params.id), req.userId!);
  return success(res, kyc, 'KYC approved');
});

router.post('/kyc/:id/reject', async (req: AuthRequest, res) => {
  const kyc = await rejectKyc(paramId(req.params.id), req.userId!, req.body.reason || 'Rejected');
  return success(res, kyc, 'KYC rejected');
});

// Deposits
router.get('/deposits/stats', async (_req, res) => {
  const stats = await depositStats();
  return success(res, stats, 'Deposit stats');
});

router.get('/deposits', async (req, res) => {
  const data = await listDepositsAdmin({
    type: req.query.type as 'CRYPTO' | 'FIAT' | undefined,
    status: req.query.status as string,
    search: req.query.search as string,
    page: Number(req.query.page) || 1,
  });
  return success(res, data, 'Deposits');
});

router.post('/deposits/:id/approve', async (req: AuthRequest, res) => {
  try {
    const d = await approveDeposit(paramId(req.params.id), req.userId!);
    return success(res, d, 'Deposit approved');
  } catch (e: unknown) {
    return fail(res, e instanceof Error ? e.message : 'Failed', 400);
  }
});

router.post('/deposits/:id/reject', async (req: AuthRequest, res) => {
  const d = await rejectDeposit(paramId(req.params.id), req.userId!, req.body.adminNote || 'Rejected');
  return success(res, d, 'Deposit rejected');
});

// Trades
router.post('/trades', async (req: AuthRequest, res) => {
  const trade = await createTrade(req.userId!, req.body);
  return success(res, trade, 'Trade created', 201);
});

router.get('/trades', async (req, res) => {
  const trades = await listTradesAdmin(req.query.status as 'OPEN' | undefined, req.query.pairId as string);
  return success(res, trades, 'Trades');
});

router.patch('/trades/:id', async (req, res) => {
  const trade = await updateTrade(paramId(req.params.id), req.body);
  return success(res, trade, 'Trade updated');
});

router.delete('/trades/:id', async (req, res) => {
  await cancelTrade(paramId(req.params.id));
  return success(res, null, 'Trade cancelled');
});

// Orders
router.post('/orders/:id/settle', async (req, res) => {
  const order = await settleOrder(paramId(req.params.id), req.body.status, req.body.closePrice);
  return success(res, order, 'Order settled');
});

// Staking
router.post('/staking/plans', async (req, res) => {
  const plan = await createPlan(req.body);
  return success(res, plan, 'Plan created', 201);
});

router.patch('/staking/plans/:id', async (req, res) => {
  const plan = await updatePlan(paramId(req.params.id), req.body);
  return success(res, plan, 'Plan updated');
});

router.get('/staking/stakes', async (req, res) => {
  const stakes = await allStakesAdmin(req.query.status as string);
  return success(res, stakes, 'All stakes');
});

// Users
router.get('/users', async (req, res) => {
  const data = await listUsers(
    req.query.search as string,
    req.query.status as string,
    Number(req.query.page) || 1
  );
  return success(res, data, 'Users');
});

router.get('/users/:id', async (req, res) => {
  const user = await getUserDetail(paramId(req.params.id));
  return success(res, user, 'User detail');
});

router.post('/users/:id/block', async (req, res) => {
  const user = await toggleUserBlock(paramId(req.params.id), req.body.block !== false);
  return success(res, user, 'User updated');
});

router.post('/users/:id/adjust-balance', async (req, res) => {
  try {
    await adjustBalance(paramId(req.params.id), Number(req.body.amount), req.body.credit === true, req.body.reason || 'Admin adjust');
    return success(res, null, 'Balance adjusted');
  } catch (e: unknown) {
    return fail(res, e instanceof Error ? e.message : 'Failed', 400);
  }
});

// Settings
router.get('/settings', async (_req, res) => {
  const settings = await getSettings();
  return success(res, settings, 'Settings');
});

router.put('/settings/:key', async (req, res) => {
  const row = await updateSettings(req.params.key, req.body.value);
  return success(res, row, 'Setting updated');
});

// Trading pairs
router.get('/pairs', async (_req, res) => {
  const pairs = await prisma.tradingPair.findMany({ where: { isActive: true } });
  return success(res, pairs, 'Pairs');
});

export default router;
