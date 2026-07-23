import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import {
  approveWithdrawal,
  formatWithdrawal,
  rejectWithdrawal,
} from '../services/withdrawalService.js';
import { emitWalletUpdate } from '../services/socketService.js';
import { error, success } from '../utils/response.js';
import { roundMoney } from '../utils/money.js';
import { withdrawableGteExpr } from '../services/walletAdjustmentService.js';
import {
  buildDateRangeFilter,
  getExportLimit,
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
  sendCsvExport,
} from '../utils/datatable.js';

const WITHDRAWAL_EXPORT_COLUMNS = [
  { key: 'userLabel', label: 'User', export: (r) => r.userLabel || '' },
  { key: 'type', label: 'Type' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency', export: (r) => r.currency || 'USDT' },
  { key: 'destination', label: 'Destination', export: (r) => r.destination || '' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created', export: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
];

async function buildAdminFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;

  const re = searchRegex(search);
  if (re) {
    const users = await User.find({
      $or: [{ email: re }, { mobile: re }, { name: re }],
    })
      .select('_id')
      .limit(200)
      .lean();
    const userIds = users.map((u) => u._id);
    filter.$or = [
      { userId: { $in: userIds } },
      { walletAddress: re },
      { accountNumber: re },
      { ifsc: re },
      { bankName: re },
    ];
  }

  return filter;
}

function enrichWithdrawalRow(req, row) {
  const formatted = formatWithdrawal(req, row, { includeUser: true });
  const userLabel = formatted.user?.email || formatted.user?.mobile || String(formatted.userId);
  const destination =
    formatted.type === 'crypto'
      ? `${formatted.network || ''} ${formatted.walletAddress || ''}`.trim()
      : `${formatted.bankName || ''} · ${formatted.accountNumber || ''} (${formatted.ifsc || ''})`.trim();
  return { ...formatted, userLabel, destination };
}

export async function listWithdrawals(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = await buildAdminFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [rows, total] = await Promise.all([
      Withdrawal.find(filter)
        .populate('userId', 'email mobile name')
        .sort(dt.sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Withdrawal.countDocuments(filter),
    ]);

    const data = rows.map((row) => enrichWithdrawalRow(req, row));

    if (dt.isExport) {
      return sendCsvExport(res, 'withdrawals.csv', data, WITHDRAWAL_EXPORT_COLUMNS);
    }

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'Withdrawals fetched'
    );
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

export async function editWithdrawal(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const withdrawal = await Withdrawal.findById(req.params.id).session(session);
    if (!withdrawal) {
      await session.abortTransaction();
      return error(res, 'Withdrawal not found', 404);
    }
    if (withdrawal.status !== 'pending') {
      await session.abortTransaction();
      return error(res, 'Only pending withdrawals can be edited', 400);
    }

    const previousAmount = roundMoney(withdrawal.amount);
    const nextAmount =
      req.body.amount !== undefined ? roundMoney(Number(req.body.amount)) : previousAmount;
    const lockDelta = roundMoney(nextAmount - previousAmount);

    if (lockDelta > 0) {
      const wallet = await Wallet.findOneAndUpdate(
        {
          userId: withdrawal.userId,
          $expr: withdrawableGteExpr(lockDelta),
        },
        { $inc: { lockedBalance: lockDelta } },
        { new: true, session }
      );
      if (!wallet) {
        throw Object.assign(
          new Error(
            'Insufficient withdrawable balance for the increased withdrawal amount (referral bonus cannot be withdrawn)'
          ),
          { status: 400 }
        );
      }
    } else if (lockDelta < 0) {
      const release = Math.abs(lockDelta);
      const wallet = await Wallet.findOneAndUpdate(
        { userId: withdrawal.userId, lockedBalance: { $gte: release } },
        { $inc: { lockedBalance: -release } },
        { new: true, session }
      );
      if (!wallet) {
        throw Object.assign(new Error('Wallet locked balance mismatch'), { status: 409 });
      }
    }

    withdrawal.amount = nextAmount;
    if (req.body.currency !== undefined) {
      withdrawal.currency = String(req.body.currency || '').trim().toUpperCase();
    }
    if (req.body.wallet_address !== undefined) {
      withdrawal.walletAddress = String(req.body.wallet_address || '').trim();
    }
    if (req.body.network !== undefined) {
      withdrawal.network = String(req.body.network || '').trim();
    }
    if (req.body.bank_name !== undefined) {
      withdrawal.bankName = String(req.body.bank_name || '').trim();
    }
    if (req.body.account_number !== undefined) {
      withdrawal.accountNumber = String(req.body.account_number || '').trim();
    }
    if (req.body.ifsc !== undefined) {
      withdrawal.ifsc = String(req.body.ifsc || '').trim().toUpperCase();
    }
    if (req.body.account_holder !== undefined) {
      withdrawal.accountHolder = String(req.body.account_holder || '').trim();
    }
    if (req.body.admin_note !== undefined) {
      withdrawal.adminNote = String(req.body.admin_note || '').trim();
    }
    await withdrawal.save({ session });

    if (withdrawal.transactionId) {
      const reference =
        withdrawal.type === 'crypto'
          ? withdrawal.walletAddress
          : withdrawal.accountNumber || String(withdrawal._id);
      await Transaction.updateOne(
        { _id: withdrawal.transactionId, status: 'pending' },
        {
          $set: {
            amount: withdrawal.amount,
            currency: withdrawal.currency || 'USDT',
            reference: reference || '',
            adminNote: withdrawal.adminNote || '',
          },
        },
        { session }
      );
    }

    await session.commitTransaction();
    await emitWalletUpdate(req.app.get('io'), withdrawal.userId, {
      reason: 'withdrawal_edited',
    });
    await withdrawal.populate('userId', 'email mobile name');
    return success(
      res,
      formatWithdrawal(req, withdrawal.toObject(), { includeUser: true }),
      'Withdrawal updated'
    );
  } catch (e) {
    await session.abortTransaction().catch(() => {});
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  } finally {
    await session.endSession();
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
