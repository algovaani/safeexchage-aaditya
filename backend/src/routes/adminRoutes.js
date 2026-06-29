import { Router } from 'express';
import * as a from '../controllers/adminController.js';
import * as kycAdmin from '../controllers/kycAdminController.js';
import * as depositAdmin from '../controllers/depositAdminController.js';
import * as withdrawalAdmin from '../controllers/withdrawalAdminController.js';
import * as treasuryAdmin from '../controllers/treasuryAdminController.js';
import * as settingsAdmin from '../controllers/settingsAdminController.js';
import * as userWalletAdmin from '../controllers/userWalletAdminController.js';
import * as adminUser from '../controllers/adminUserController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { validateBody } from '../middleware/validate.js';
import { reviewKycValidators } from '../validators/kycValidators.js';
import {
  adminOrdersListValidators,
  adminKycListValidators,
  adminUsersListValidators,
} from '../validators/adminListValidators.js';
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
import {
  treasuryListValidators,
  treasuryWithdrawValidators,
  treasurySweepValidators,
  treasuryDepositIdValidators,
} from '../validators/treasuryValidators.js';
import { platformSettingsValidators } from '../validators/settingsValidators.js';
import {
  adjustUserFundsValidators,
  userFundHistoryValidators,
} from '../validators/userWalletValidators.js';
import {
  adminUserIdParamValidators,
  adminUserDepositsValidators,
  adminUserWithdrawalsValidators,
  adminUserTradesValidators,
  adminUserOrdersValidators,
} from '../validators/adminUserValidators.js';
import reportsRoutes from './admin/reportsRoutes.js';

const r = Router();

r.use(requireAuth, requireAdmin);

r.get('/overview', a.overviewStats);
r.get('/users', adminUsersListValidators, validateRequest, a.listUsers);
r.post(
  '/users/:userId/fund-adjustment',
  adjustUserFundsValidators,
  validateRequest,
  userWalletAdmin.adjustUserFunds
);
r.get(
  '/users/:userId/fund-adjustments',
  userFundHistoryValidators,
  validateRequest,
  userWalletAdmin.listUserFundAdjustments
);
r.get('/users/:userId', adminUserIdParamValidators, validateRequest, adminUser.getUserDetail);
r.get('/users/:userId/deposits', adminUserDepositsValidators, validateRequest, adminUser.listUserDeposits);
r.get(
  '/users/:userId/withdrawals',
  adminUserWithdrawalsValidators,
  validateRequest,
  adminUser.listUserWithdrawals
);
r.get('/users/:userId/trades', adminUserTradesValidators, validateRequest, adminUser.listUserTrades);
r.get('/users/:userId/orders', adminUserOrdersValidators, validateRequest, adminUser.listUserOrders);
r.get('/kyc', adminKycListValidators, validateRequest, kycAdmin.listSubmissions);
r.get('/kyc/:id', kycAdmin.getSubmission);
r.patch('/kyc/:id/review', reviewKycValidators, validateRequest, kycAdmin.reviewSubmission);
r.get('/deposits', adminDepositListValidators, validateRequest, depositAdmin.listDeposits);
r.get('/deposits/:id', depositAdmin.getDeposit);
r.get('/deposits/:id/sweep-preview', treasuryDepositIdValidators, validateRequest, treasuryAdmin.getSweepPreview);
r.post('/deposits/:id/fund-gas', treasuryDepositIdValidators, validateRequest, treasuryAdmin.fundGas);
r.post(
  '/deposits/:id/sweep',
  treasuryDepositIdValidators,
  treasurySweepValidators,
  validateRequest,
  treasuryAdmin.autoSweepDeposit
);
r.patch('/deposits/:id/verify', verifyDepositValidators, validateRequest, depositAdmin.verifyDeposit);
r.post('/deposits/bulk/approve', depositAdmin.bulkDepositAction);
r.post('/deposits/bulk/reject', depositAdmin.bulkRejectDeposits);
r.post('/deposits/bulk/treasury-withdraw', treasuryWithdrawValidators, validateRequest, depositAdmin.bulkTreasuryWithdraw);
r.post(
  '/deposits/:id/treasury-withdraw',
  treasuryWithdrawValidators,
  validateRequest,
  treasuryAdmin.withdrawDepositToAdmin
);
r.get('/treasury/config', treasuryAdmin.treasuryConfig);
r.get('/treasury/pending-sweeps', treasuryAdmin.listPendingSweeps);
r.get('/treasury/sweep-preview/:id', treasuryDepositIdValidators, validateRequest, treasuryAdmin.getSweepPreview);
r.post('/treasury/fund-gas/:id', treasuryDepositIdValidators, validateRequest, treasuryAdmin.fundGas);
r.post(
  '/treasury/sweep/:id',
  treasuryDepositIdValidators,
  treasurySweepValidators,
  validateRequest,
  treasuryAdmin.autoSweepDeposit
);
r.get('/settings', settingsAdmin.getSettings);
r.put('/settings', platformSettingsValidators, validateRequest, settingsAdmin.updateSettings);
r.get(
  '/treasury-withdrawals',
  treasuryListValidators,
  validateRequest,
  treasuryAdmin.listTreasuryWithdrawals
);
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
r.get('/orders', adminOrdersListValidators, validateRequest, a.listAllOrders);
r.post('/manual-prices', validateBody(manualPriceSchema), a.upsertManualPrice);
r.get('/manual-prices', a.listManualPrices);
r.delete('/manual-prices/:id', a.deleteManualPrice);
r.use('/dashboard', dashboardRoutes);
r.use('/reports', reportsRoutes);
r.use('/trades', tradeRoutes);
r.use('/staking', stakingAdminRoutes);
r.get('/exchange-trades', a.allTrades);

export default r;
