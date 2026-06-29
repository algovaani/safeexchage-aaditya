import { Transaction } from '../models/Transaction.js';
import { error, success } from '../utils/response.js';
import {
  adjustUserWalletBalance,
  formatFundAdjustment,
} from '../services/walletAdjustmentService.js';

export async function adjustUserFunds(req, res, next) {
  try {
    const { action, amount, remark } = req.body;
    const result = await adjustUserWalletBalance({
      userId: req.params.userId,
      adminId: req.userId,
      action,
      amount,
      remark,
    });

    const label = action === 'add' ? 'Funds added' : 'Funds deducted';
    return success(res, result, `${label} successfully`);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function listUserFundAdjustments(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rows = await Transaction.find({
      userId: req.params.userId,
      type: { $in: ['admin_credit', 'admin_debit'] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return success(res, rows.map(formatFundAdjustment), 'Fund adjustment history fetched');
  } catch (e) {
    return next(e);
  }
}
