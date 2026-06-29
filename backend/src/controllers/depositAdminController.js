import { User } from '../models/User.js';
import { Deposit } from '../models/Deposit.js';
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

    const userIds = [...new Set(rows.map((r) => String(r.userId?._id || r.userId)))];
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
    const addresses = await UserDepositAddress.find({
      userId: row.userId?._id || row.userId,
    }).lean();
    const addressMap = new Map(
      addresses.map((a) => [`${String(a.userId)}:${a.chain}`, a.address])
    );
    return success(res, enrichDepositRow(req, row, { settings, addressMap }), 'Deposit fetched');
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

    if (action === 'approve') {
      if (deposit.status !== 'pending') {
        return error(res, 'Only pending deposits can be approved', 400);
      }
      const { deposit: updated } = await creditWalletForDeposit(deposit, req.userId);
      if (!updated.chain) {
        updated.chain = normalizeChainFromNetwork(updated.network) || '';
        await updated.save();
      }
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
