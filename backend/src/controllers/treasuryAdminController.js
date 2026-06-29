import { User } from '../models/User.js';
import { Deposit } from '../models/Deposit.js';
import { TreasuryWithdrawal } from '../models/TreasuryWithdrawal.js';
import {
  createTreasuryWithdrawalFromDeposit,
  defaultAdminWalletAddress,
  formatTreasuryWithdrawal,
} from '../services/treasuryService.js';
import {
  buildSweepPreview,
  executeAutoSweep,
  fundGasForDeposit,
  listPendingSweepDeposits,
} from '../services/treasurySweepService.js';
import { getPlatformSettings, formatPublicSettings } from '../services/platformSettingsService.js';
import { error, success } from '../utils/response.js';
import {
  buildDateRangeFilter,
  getExportLimit,
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
  sendCsvExport,
} from '../utils/datatable.js';

const EXPORT_COLUMNS = [
  { key: 'userLabel', label: 'User', export: (r) => r.userLabel || '' },
  { key: 'amount', label: 'Amount', export: (r) => `${r.amount} ${r.currency || ''}` },
  { key: 'usdtAmount', label: 'USDT Credit', export: (r) => r.usdtAmount ?? '' },
  { key: 'network', label: 'Network' },
  { key: 'userTxnHash', label: 'User Deposit TX' },
  { key: 'adminWalletAddress', label: 'Admin Wallet' },
  { key: 'outboundTxnHash', label: 'Admin Withdraw TX' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created', export: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
];

async function buildFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  if (query.status) filter.status = query.status;
  if (query.currency) filter.currency = String(query.currency).toUpperCase();

  const re = searchRegex(search);
  if (re) {
    const users = await User.find({
      $or: [{ email: re }, { mobile: re }, { name: re }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.$or = [
      { userId: { $in: users.map((u) => u._id) } },
      { currency: re },
      { network: re },
      { userTxnHash: re },
      { outboundTxnHash: re },
      { adminWalletAddress: re },
    ];
  }

  return filter;
}

function enrichRow(row) {
  const formatted = formatTreasuryWithdrawal(row, { includeUser: true, includeDeposit: true });
  formatted.userLabel = formatted.user?.email || formatted.user?.mobile || String(formatted.userId);
  return formatted;
}

export async function treasuryConfig(_req, res) {
  const doc = await getPlatformSettings({ includeSecrets: true });
  const pub = formatPublicSettings(doc);
  return success(
    res,
    {
      adminWalletAddress: defaultAdminWalletAddress(),
      bnbWalletAddress: pub.bnbWalletAddress || '',
      ethWalletAddress: pub.ethWalletAddress || '',
      trcWalletAddress: pub.trcWalletAddress || '',
      hasBnbGasKey: pub.hasBnbPrivateKey,
      hasEthGasKey: pub.hasEthPrivateKey,
      hasEvmMnemonic: pub.hasEvmMnemonic,
      gasTopUp: { BNB: process.env.TREASURY_GAS_TOPUP_BNB || '0.0006', ETH: process.env.TREASURY_GAS_TOPUP_ETH || '0.0015' },
      supportedAutoSweepChains: ['BNB', 'ETH'],
      hint: 'Auto-sweep transfers USDT from user deposit address to admin wallet. BNB/ETH gas is sent from admin hot wallet when needed.',
    },
    'Treasury config fetched'
  );
}

export async function listPendingSweeps(req, res, next) {
  try {
    const rows = await listPendingSweepDeposits(req);
    return success(res, { rows, total: rows.length }, 'Pending sweeps fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getSweepPreview(req, res, next) {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) return error(res, 'Deposit not found', 404);
    const preview = await buildSweepPreview(deposit, req);
    return success(res, preview, 'Sweep preview fetched');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function fundGas(req, res, next) {
  try {
    const result = await fundGasForDeposit(req.params.id, req.userId);
    return success(res, result, result.message, 201);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function autoSweepDeposit(req, res, next) {
  try {
    const result = await executeAutoSweep(req.params.id, req.userId, req.body);
    return success(res, result, result.message, 201);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function listTreasuryWithdrawals(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = await buildFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [rows, total] = await Promise.all([
      TreasuryWithdrawal.find(filter)
        .populate('userId', 'email mobile name')
        .populate('depositId', 'amount currency txnHash network status')
        .sort(dt.sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      TreasuryWithdrawal.countDocuments(filter),
    ]);

    const data = rows.map(enrichRow);

    if (dt.isExport) {
      return sendCsvExport(res, 'treasury-withdrawals.csv', data, EXPORT_COLUMNS);
    }

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'Treasury withdrawals fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function withdrawDepositToAdmin(req, res, next) {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      return error(res, 'Deposit not found', 404);
    }

    const treasuryWithdrawal = await createTreasuryWithdrawalFromDeposit(
      deposit,
      req.userId,
      req.body
    );

    await treasuryWithdrawal.populate('userId', 'email mobile name');
    return success(
      res,
      formatTreasuryWithdrawal(treasuryWithdrawal.toObject(), { includeUser: true }),
      'Treasury withdrawal recorded — funds marked as moved to admin wallet',
      201
    );
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}
