import { Router } from 'express';
import * as a from '../controllers/adminController.js';
import * as kycAdmin from '../controllers/kycAdminController.js';
import * as depositAdmin from '../controllers/depositAdminController.js';
import * as withdrawalAdmin from '../controllers/withdrawalAdminController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { validateBody } from '../middleware/validate.js';
import { reviewKycValidators } from '../validators/kycValidators.js';
import {
  adminDepositListValidators,
  verifyDepositValidators,
} from '../validators/depositValidators.js';
import {
  adminWithdrawalListValidators,
  verifyWithdrawalValidators,
} from '../validators/withdrawalValidators.js';
import { manualPriceSchema } from '../validators/schemas.js';
import tradeRoutes from './admin/tradeRoutes.js';
import stakingAdminRoutes from './admin/stakingRoutes.js';
import dashboardRoutes from './admin/dashboardRoutes.js';
import reportsRoutes from './admin/reportsRoutes.js';

const r = Router();

r.use(requireAuth, requireAdmin);

r.get('/users', a.listUsers);
r.get('/kyc', kycAdmin.listSubmissions);
r.get('/kyc/:id', kycAdmin.getSubmission);
r.patch('/kyc/:id/review', reviewKycValidators, validateRequest, kycAdmin.reviewSubmission);
r.get('/deposits', adminDepositListValidators, validateRequest, depositAdmin.listDeposits);
r.get('/deposits/:id', depositAdmin.getDeposit);
r.patch('/deposits/:id/verify', verifyDepositValidators, validateRequest, depositAdmin.verifyDeposit);
r.get(
  '/withdrawals',
  adminWithdrawalListValidators,
  validateRequest,
  withdrawalAdmin.listWithdrawals
);
r.get('/withdrawals/:id', withdrawalAdmin.getWithdrawal);
r.patch(
  '/withdrawals/:id/verify',
  verifyWithdrawalValidators,
  validateRequest,
  withdrawalAdmin.verifyWithdrawal
);
r.get('/transactions', a.listPendingTransactions);
r.get('/transactions/all', a.listAllTransactions);
r.patch('/transactions/:id', a.approveTransaction);
r.get('/orders', a.listAllOrders);
r.post('/manual-prices', validateBody(manualPriceSchema), a.upsertManualPrice);
r.get('/manual-prices', a.listManualPrices);
r.delete('/manual-prices/:id', a.deleteManualPrice);
r.use('/dashboard', dashboardRoutes);
r.use('/reports', reportsRoutes);
r.use('/trades', tradeRoutes);
r.use('/staking', stakingAdminRoutes);
r.get('/exchange-trades', a.allTrades);

export default r;
