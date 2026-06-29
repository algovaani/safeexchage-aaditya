import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { Deposit } from '../models/Deposit.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { Trade } from '../models/Trade.js';
import { Order } from '../models/Order.js';
import { KycSubmission } from '../models/KycSubmission.js';
import { UserDepositAddress } from '../models/UserDepositAddress.js';
import { enrichDepositRow } from '../services/depositEnrichmentService.js';
import { formatWithdrawal } from '../services/withdrawalService.js';
import { getPlatformSettings } from '../services/platformSettingsService.js';
import { formatWalletSnapshot } from '../services/walletAdjustmentService.js';
import { listUserAssets } from '../services/assetBalanceService.js';
import { error, success } from '../utils/response.js';
import { roundMoney } from '../utils/money.js';
import {
  paginatedPayload,
  parseDatatableQuery,
} from '../utils/datatable.js';

function formatUserTrade(trade, userId) {
  const uid = String(userId);
  const isBuyer = String(trade.buyerUserId) === uid;
  const total = trade.price * trade.quantity;
  return {
    id: trade._id,
    symbol: trade.symbol,
    side: isBuyer ? 'buy' : 'sell',
    price: trade.price,
    quantity: trade.quantity,
    fee: trade.fee,
    total: roundMoney(total),
    createdAt: trade.createdAt,
  };
}

function formatUserOrder(order) {
  return {
    id: order._id,
    symbol: order.symbol,
    side: order.side,
    orderType: order.orderType,
    quantity: order.quantity,
    price: order.price,
    status: order.status,
    avgFillPrice: order.avgFillPrice ?? null,
    createdAt: order.createdAt,
  };
}

export async function getUserDetail(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return error(res, 'Invalid user id', 400);
    }

    const user = await User.findById(userId).select('-passwordHash').lean();
    if (!user) return error(res, 'User not found', 404);

    const [wallet, assets, depositAddresses, kyc, depositCount, withdrawalCount, tradeCount, orderCount] =
      await Promise.all([
        Wallet.findOne({ userId }).lean(),
        listUserAssets(userId),
        UserDepositAddress.find({ userId }).lean(),
        KycSubmission.findOne({ userId }).sort({ createdAt: -1 }).lean(),
        Deposit.countDocuments({ userId }),
        Withdrawal.countDocuments({ userId }),
        Trade.countDocuments({ $or: [{ buyerUserId: userId }, { sellerUserId: userId }] }),
        Order.countDocuments({ userId }),
      ]);

    let referredByLabel = null;
    if (user.referredBy) {
      const ref = await User.findById(user.referredBy).select('email mobile name').lean();
      referredByLabel = ref?.email || ref?.mobile || ref?.name || String(user.referredBy);
    }

    return success(
      res,
      {
        id: user._id,
        email: user.email || null,
        mobile: user.mobile || null,
        name: user.name || '',
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        mobileVerified: user.mobileVerified,
        referralCode: user.referralCode || '',
        referredBy: user.referredBy,
        referredByLabel,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        wallet: formatWalletSnapshot(wallet, assets),
        depositAddresses: depositAddresses.map((a) => ({
          chain: a.chain,
          address: a.address,
          network: a.network,
          currency: a.currency,
        })),
        kyc: kyc
          ? {
              id: kyc._id,
              status: kyc.status,
              docType: kyc.docType,
              submittedAt: kyc.createdAt,
              reviewedAt: kyc.reviewedAt || null,
            }
          : null,
        stats: {
          deposits: depositCount,
          withdrawals: withdrawalCount,
          trades: tradeCount,
          orders: orderCount,
        },
      },
      'User detail fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function listUserDeposits(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return error(res, 'Invalid user id', 400);
    }

    const dt = parseDatatableQuery(req.query);
    const filter = { userId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;

    const [rows, total, settings, addresses] = await Promise.all([
      Deposit.find(filter)
        .populate('userId', 'email mobile name')
        .sort(dt.sort)
        .skip(dt.skip)
        .limit(dt.pageSize)
        .lean(),
      Deposit.countDocuments(filter),
      getPlatformSettings({ includeSecrets: true }),
      UserDepositAddress.find({ userId }).lean(),
    ]);

    const addressMap = new Map(addresses.map((a) => [`${userId}:${a.chain}`, a.address]));

    const data = rows.map((row) => enrichDepositRow(req, row, { settings, addressMap }));

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'User deposits fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function listUserWithdrawals(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return error(res, 'Invalid user id', 400);
    }

    const dt = parseDatatableQuery(req.query);
    const filter = { userId };
    if (req.query.status) filter.status = req.query.status;

    const [rows, total] = await Promise.all([
      Withdrawal.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Withdrawal.countDocuments(filter),
    ]);

    const data = rows.map((row) => formatWithdrawal(req, row));

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'User withdrawals fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function listUserTrades(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return error(res, 'Invalid user id', 400);
    }

    const dt = parseDatatableQuery(req.query);
    let filter;
    if (req.query.side === 'buy') {
      filter = { buyerUserId: userId };
    } else if (req.query.side === 'sell') {
      filter = { sellerUserId: userId };
    } else {
      filter = { $or: [{ buyerUserId: userId }, { sellerUserId: userId }] };
    }

    const [rows, total] = await Promise.all([
      Trade.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Trade.countDocuments(filter),
    ]);

    const data = rows.map((t) => formatUserTrade(t, userId));

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'User trades fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function listUserOrders(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return error(res, 'Invalid user id', 400);
    }

    const dt = parseDatatableQuery(req.query);
    const filter = { userId };
    if (req.query.side) filter.side = req.query.side;
    if (req.query.status) filter.status = req.query.status;

    const [rows, total] = await Promise.all([
      Order.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Order.countDocuments(filter),
    ]);

    const data = rows.map(formatUserOrder);

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'User orders fetched'
    );
  } catch (e) {
    return next(e);
  }
}
