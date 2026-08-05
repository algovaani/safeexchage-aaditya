import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Deposit } from '../models/Deposit.js';
import { Transaction } from '../models/Transaction.js';
import { UserDepositAddress } from '../models/UserDepositAddress.js';
import {
  creditWalletForDeposit,
  formatDeposit,
  rejectDepositWithReversal,
} from '../services/depositService.js';
import { enrichDepositRow } from '../services/depositEnrichmentService.js';
import { createTreasuryWithdrawalFromDeposit } from '../services/treasuryService.js';
import { normalizeChainFromNetwork } from '../services/userDepositAddressService.js';
import { getPlatformSettings } from '../services/platformSettingsService.js';
import { emitWalletUpdate } from '../services/socketService.js';
import { resolveNotificationsForRef } from '../services/adminNotificationService.js';
import { error, success } from '../utils/response.js';
import {
  buildDateRangeFilter,
  getExportLimit,
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
  sendCsvExport,
} from '../utils/datatable.js';

const DEPOSIT_EXPORT_COLUMNS = [
  { key: 'userLabel', label: 'User', export: (r) => r.userLabel || '' },
  { key: 'type', label: 'Type' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency', export: (r) => r.currency || 'USDT' },
  { key: 'reference', label: 'Reference', export: (r) => r.reference || '' },
  { key: 'status', label: 'Status' },
  { key: 'bonusAmount', label: 'Trading bonus', export: (r) => (r.bonusAmount > 0 ? r.bonusAmount : '') },
  { key: 'createdAt', label: 'Created', export: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
];

async function buildAdminFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.chain) {
    const chain = String(query.chain).toUpperCase();
    filter.$or = [
      { chain },
      { network: new RegExp(chain === 'BNB' ? 'BEP|BSC' : chain === 'ETH' ? 'ERC|ETH' : 'TRC|TRX', 'i') },
    ];
  }

  const re = searchRegex(search);
  if (re) {
    const users = await User.find({
      $or: [{ email: re }, { mobile: re }, { name: re }],
    })
      .select('_id')
      .limit(200)
      .lean();
    const userIds = users.map((u) => u._id);
    const searchOr = [
      { userId: { $in: userIds } },
      { txnHash: re },
      { utrNumber: re },
      { network: re },
      { currency: re },
      { toAddress: re },
      { fromAddress: re },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
  }

  return filter;
}

export async function listDeposits(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = await buildAdminFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [rows, total] = await Promise.all([
      Deposit.find(filter)
        .populate('userId', 'email mobile name')
        .sort(dt.sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Deposit.countDocuments(filter),
    ]);

    const userIds = [...new Set(rows.map((r) => String(r.userId?._id || r.userId || '')))].filter(
      (id) => mongoose.Types.ObjectId.isValid(id)
    );
    const [settings, addressRows] = await Promise.all([
      getPlatformSettings({ includeSecrets: true }),
      UserDepositAddress.find({ userId: { $in: userIds } }).lean(),
    ]);
    const addressMap = new Map(
      addressRows.map((a) => [`${String(a.userId)}:${a.chain}`, a.address])
    );
    const data = rows.map((row) => enrichDepositRow(req, row, { settings, addressMap }));

    if (dt.isExport) {
      return sendCsvExport(res, 'deposits.csv', data, DEPOSIT_EXPORT_COLUMNS);
    }

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'Deposits fetched'
    );
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

    const settings = await getPlatformSettings({ includeSecrets: true });
    const ownerId = row.userId?._id || row.userId;
    const addresses = mongoose.Types.ObjectId.isValid(ownerId)
      ? await UserDepositAddress.find({ userId: ownerId }).lean()
      : [];
    const addressMap = new Map(
      addresses.map((a) => [`${String(a.userId)}:${a.chain}`, a.address])
    );
    return success(res, enrichDepositRow(req, row, { settings, addressMap }), 'Deposit fetched');
  } catch (e) {
    return next(e);
  }
}

export async function editDeposit(req, res, next) {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) return error(res, 'Deposit not found', 404);
    if (deposit.status !== 'pending') {
      return error(res, 'Only pending deposits can be edited', 400);
    }

    const nextTxnHash =
      req.body.txn_hash !== undefined ? String(req.body.txn_hash || '').trim() : deposit.txnHash;
    if (nextTxnHash && nextTxnHash !== deposit.txnHash) {
      const duplicate = await Deposit.findOne({
        _id: { $ne: deposit._id },
        txnHash: nextTxnHash,
      })
        .select('_id')
        .lean();
      if (duplicate) return error(res, 'Transaction hash already exists', 409);
    }

    if (req.body.amount !== undefined) deposit.amount = Number(req.body.amount);
    if (req.body.currency !== undefined) {
      deposit.currency = String(req.body.currency || '').trim().toUpperCase();
    }
    if (req.body.txn_hash !== undefined) deposit.txnHash = nextTxnHash;
    if (req.body.network !== undefined) deposit.network = String(req.body.network || '').trim();
    if (req.body.from_address !== undefined) {
      deposit.fromAddress = String(req.body.from_address || '').trim();
    }
    if (req.body.to_address !== undefined) {
      deposit.toAddress = String(req.body.to_address || '').trim();
    }
    if (req.body.utr_number !== undefined) {
      deposit.utrNumber = String(req.body.utr_number || '').trim();
    }
    if (req.body.bank_name !== undefined) {
      deposit.bankName = String(req.body.bank_name || '').trim();
    }
    if (req.body.account_number !== undefined) {
      deposit.accountNumber = String(req.body.account_number || '').trim();
    }
    if (req.body.admin_note !== undefined) {
      deposit.adminNote = String(req.body.admin_note || '').trim();
    }

    // Pending conversion values must be recalculated from the edited amount/currency on approval.
    deposit.usdtAmount = null;
    deposit.conversionRate = null;
    if (deposit.type === 'crypto') {
      deposit.chain = normalizeChainFromNetwork(deposit.network) || '';
    }
    await deposit.save();

    if (deposit.transactionId) {
      const reference =
        deposit.type === 'crypto'
          ? deposit.txnHash || String(deposit._id)
          : deposit.utrNumber || String(deposit._id);
      await Transaction.updateOne(
        { _id: deposit.transactionId, status: 'pending' },
        {
          $set: {
            amount: deposit.amount,
            currency: String(deposit.currency || 'USDT').toUpperCase(),
            reference,
            adminNote: deposit.adminNote || '',
          },
        }
      );
    }

    await deposit.populate('userId', 'email mobile name');
    return success(
      res,
      formatDeposit(req, deposit.toObject(), { includeUser: true }),
      'Deposit updated'
    );
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
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

    if (action === 'approve') {
      if (deposit.status !== 'pending') {
        return error(res, 'Only pending deposits can be approved', 400);
      }
      const bonusPercent = req.body.apply_bonus ? Number(req.body.bonus_percent) || 0 : 0;
      const bonusFlat = req.body.apply_bonus ? Number(req.body.bonus_flat) || 0 : 0;
      const { deposit: updated } = await creditWalletForDeposit(deposit, req.userId, {
        bonusPercent,
        bonusFlat,
      });
      if (!updated.chain) {
        updated.chain = normalizeChainFromNetwork(updated.network) || '';
        await updated.save();
      }
      await emitWalletUpdate(req.app.get('io'), updated.userId, { reason: 'deposit_approved' });
      void resolveNotificationsForRef(req.app.get('io'), 'deposit', updated._id);
      await updated.populate('userId', 'email mobile name');
      return success(
        res,
        formatDeposit(req, updated.toObject(), { includeUser: true }),
        'Deposit approved and wallet credited'
      );
    }

    if (action === 'cancel' || action === 'reject') {
      if (deposit.status === 'rejected') {
        return error(res, 'Deposit is already rejected', 400);
      }
      const updated = await rejectDepositWithReversal(deposit, req.userId, note || (action === 'cancel' ? 'Cancelled by admin' : ''));
      await emitWalletUpdate(req.app.get('io'), updated.userId, { reason: 'deposit_rejected' });
      void resolveNotificationsForRef(req.app.get('io'), 'deposit', updated._id);
      await updated.populate('userId', 'email mobile name');
      return success(
        res,
        formatDeposit(req, updated.toObject(), { includeUser: true }),
        action === 'cancel' ? 'Deposit cancelled' : 'Deposit rejected and wallet adjusted'
      );
    }

    return error(res, 'Invalid action', 400);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function bulkDepositAction(req, res, next) {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return error(res, 'ids array is required', 400);

    const results = { approved: 0, failed: 0, errors: [] };
    for (const id of ids) {
      try {
        const deposit = await Deposit.findById(id);
        if (!deposit || deposit.status !== 'pending') {
          results.failed += 1;
          continue;
        }
        await creditWalletForDeposit(deposit, req.userId);
        await emitWalletUpdate(req.app.get('io'), deposit.userId, { reason: 'deposit_approved' });
        void resolveNotificationsForRef(req.app.get('io'), 'deposit', deposit._id);
        results.approved += 1;
      } catch (err) {
        results.failed += 1;
        results.errors.push({ id, message: err.message });
      }
    }

    return success(res, results, 'Bulk deposit completed');
  } catch (e) {
    return next(e);
  }
}

export async function bulkRejectDeposits(req, res, next) {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const note = String(req.body.note || 'Bulk rejected by admin').trim();
    if (!ids.length) return error(res, 'ids array is required', 400);

    const results = { rejected: 0, failed: 0 };
    for (const id of ids) {
      try {
        const deposit = await Deposit.findById(id);
        if (!deposit || deposit.status === 'rejected') {
          results.failed += 1;
          continue;
        }
        await rejectDepositWithReversal(deposit, req.userId, note);
        await emitWalletUpdate(req.app.get('io'), deposit.userId, { reason: 'deposit_rejected' });
        void resolveNotificationsForRef(req.app.get('io'), 'deposit', deposit._id);
        results.rejected += 1;
      } catch {
        results.failed += 1;
      }
    }

    return success(res, results, 'Bulk reject completed');
  } catch (e) {
    return next(e);
  }
}

export async function bulkTreasuryWithdraw(req, res, next) {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const adminWallet = String(req.body.admin_wallet_address || '').trim();
    const outboundTxnHash = String(req.body.outbound_txn_hash || '').trim();
    if (!ids.length) return error(res, 'ids array is required', 400);

    const results = { withdrawn: 0, failed: 0, errors: [] };
    for (const id of ids) {
      try {
        const deposit = await Deposit.findById(id);
        if (!deposit) {
          results.failed += 1;
          continue;
        }
        await createTreasuryWithdrawalFromDeposit(deposit, req.userId, {
          admin_wallet_address: adminWallet,
          outbound_txn_hash: outboundTxnHash || `bulk-${Date.now()}-${id}`,
          notes: 'Bulk treasury withdrawal',
        });
        results.withdrawn += 1;
      } catch (err) {
        results.failed += 1;
        results.errors.push({ id, message: err.message });
      }
    }

    return success(res, results, 'Bulk treasury withdrawal completed');
  } catch (e) {
    return next(e);
  }
}
