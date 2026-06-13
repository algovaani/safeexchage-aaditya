import { Deposit } from '../models/Deposit.js';
import { creditWalletForDeposit, formatDeposit } from '../services/depositService.js';
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

export async function listDeposits(req, res, next) {
  try {
    const filter = buildAdminFilter(req.query);
    const rows = await Deposit.find(filter)
      .populate('userId', 'email mobile name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const data = rows.map((row) => formatDeposit(req, row, { includeUser: true }));
    return success(res, data, 'Deposits fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getDeposit(req, res, next) {
  try {
    const row = await Deposit.findById(req.params.id)
      .populate('userId', 'email mobile name')
      .lean();

    if (!row) {
      return error(res, 'Deposit not found', 404);
    }

    return success(res, formatDeposit(req, row, { includeUser: true }), 'Deposit fetched');
  } catch (e) {
    return next(e);
  }
}

export async function verifyDeposit(req, res, next) {
  try {
    const { action, note } = req.body;
    const deposit = await Deposit.findById(req.params.id);

    if (!deposit) {
      return error(res, 'Deposit not found', 404);
    }

    if (deposit.status !== 'pending') {
      return error(res, 'Only pending deposits can be verified', 400);
    }

    if (action === 'approve') {
      const { deposit: updated } = await creditWalletForDeposit(deposit, req.userId);
      await updated.populate('userId', 'email mobile name');
      return success(res, formatDeposit(req, updated.toObject(), { includeUser: true }), 'Deposit approved and wallet credited');
    }

    deposit.status = 'rejected';
    deposit.adminNote = note?.trim() || '';
    deposit.reviewedBy = req.userId;
    deposit.reviewedAt = new Date();
    await deposit.save();
    await deposit.populate('userId', 'email mobile name');

    return success(res, formatDeposit(req, deposit.toObject(), { includeUser: true }), 'Deposit rejected');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}
