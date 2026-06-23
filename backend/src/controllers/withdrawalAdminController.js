import { Withdrawal } from '../models/Withdrawal.js';
import {
  approveWithdrawal,
  formatWithdrawal,
  rejectWithdrawal,
} from '../services/withdrawalService.js';
import { error, success } from '../utils/response.js';

function buildAdminFilter(query) {
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  return filter;
}

export async function listWithdrawals(req, res, next) {
  try {
    const filter = buildAdminFilter(req.query);
    const rows = await Withdrawal.find(filter)
      .populate('userId', 'email mobile name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const data = rows.map((row) => formatWithdrawal(req, row, { includeUser: true }));
    return success(res, data, 'Withdrawals fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getWithdrawal(req, res, next) {
  try {
    const row = await Withdrawal.findById(req.params.id)
      .populate('userId', 'email mobile name')
      .lean();

    if (!row) {
      return error(res, 'Withdrawal not found', 404);
    }

    return success(res, formatWithdrawal(req, row, { includeUser: true }), 'Withdrawal fetched');
  } catch (e) {
    return next(e);
  }
}

export async function verifyWithdrawal(req, res, next) {
  try {
    const { action, note } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id);

    if (!withdrawal) {
      return error(res, 'Withdrawal not found', 404);
    }

    if (withdrawal.status !== 'pending') {
      return error(res, 'Only pending withdrawals can be verified', 400);
    }

    if (action === 'approve') {
      const { withdrawal: updated } = await approveWithdrawal(withdrawal, req.userId);
      await updated.populate('userId', 'email mobile name');
      return success(
        res,
        formatWithdrawal(req, updated.toObject(), { includeUser: true }),
        'Withdrawal approved and funds debited'
      );
    }

    const updated = await rejectWithdrawal(withdrawal, req.userId, note);
    await updated.populate('userId', 'email mobile name');

    return success(
      res,
      formatWithdrawal(req, updated.toObject(), { includeUser: true }),
      'Withdrawal rejected'
    );
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}
