import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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
  searchRegex,
} from '../utils/datatable.js';

const BCRYPT_ROUNDS = 12;

function formatUserTrade(trade, userId, orderById = new Map()) {
  const uid = String(userId);
  const order =
    orderById.get(String(trade.buyOrderId)) ||
    orderById.get(String(trade.sellOrderId)) ||
    null;

  let side;
  if (order && String(order.userId) === uid) {
    side = order.side;
  } else if (String(trade.buyerUserId) === uid && String(trade.sellerUserId) !== uid) {
    side = 'buy';
  } else if (String(trade.sellerUserId) === uid && String(trade.buyerUserId) !== uid) {
    side = 'sell';
  } else {
    side = String(trade.buyerUserId) === uid ? 'buy' : 'sell';
  }

  const total = trade.price * trade.quantity;
  return {
    id: trade._id,
    symbol: trade.symbol,
    side,
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

    const user = await User.findById(userId).select('+passwordPlain -passwordHash').lean();
    if (!user) return error(res, 'User not found', 404);

    const [
      wallet,
      assets,
      depositAddresses,
      kyc,
      depositCount,
      withdrawalCount,
      tradeCount,
      orderCount,
      invitedCount,
    ] = await Promise.all([
      Wallet.findOne({ userId }).lean(),
      listUserAssets(userId),
      UserDepositAddress.find({ userId }).lean(),
      KycSubmission.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      Deposit.countDocuments({ userId }),
      Withdrawal.countDocuments({ userId }),
      Trade.countDocuments({ $or: [{ buyerUserId: userId }, { sellerUserId: userId }] }),
      Order.countDocuments({ userId }),
      User.countDocuments({ referredBy: userId }),
    ]);

    let referredByLabel = null;
    let referredByCode = null;
    if (user.referredBy) {
      const ref = await User.findById(user.referredBy).select('email mobile name referralCode').lean();
      referredByCode = ref?.referralCode || null;
      referredByLabel =
        ref?.referralCode || ref?.email || ref?.mobile || ref?.name || String(user.referredBy);
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
        loginId: user.mobile || user.email || '',
        password: user.passwordPlain || '',
        referralCode: user.referralCode || '',
        referredBy: user.referredBy,
        referredByLabel,
        referredByCode,
        invitedCount,
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

export async function setUserPassword(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return error(res, 'Invalid user id', 400);
    }

    const password = String(req.body.password || '').trim();
    if (password.length < 6) {
      return error(res, 'Password must be at least 6 characters', 400);
    }

    const user = await User.findById(userId);
    if (!user) return error(res, 'User not found', 404);

    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.passwordPlain = password;
    await user.save();

    return success(
      res,
      {
        id: user._id,
        loginId: user.mobile || user.email || '',
        password,
      },
      'User password updated'
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
    let filter = { $or: [{ buyerUserId: userId }, { sellerUserId: userId }] };
    if (req.query.side === 'buy' || req.query.side === 'sell') {
      const orderIds = await Order.find({ userId, side: req.query.side }).distinct('_id');
      if (!orderIds.length) {
        return success(
          res,
          paginatedPayload({ rows: [], total: 0, page: dt.page, pageSize: dt.pageSize }),
          'User trades fetched'
        );
      }
      const sideMatch =
        req.query.side === 'buy'
          ? { buyOrderId: { $in: orderIds } }
          : { sellOrderId: { $in: orderIds } };
      filter = { $and: [filter, sideMatch] };
    }

    const [rows, total] = await Promise.all([
      Trade.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Trade.countDocuments(filter),
    ]);

    const orderIds = [
      ...new Set(rows.flatMap((t) => [String(t.buyOrderId), String(t.sellOrderId)].filter(Boolean))),
    ];
    const orders = orderIds.length
      ? await Order.find({ _id: { $in: orderIds } }).select('_id side userId').lean()
      : [];
    const orderById = new Map(orders.map((o) => [String(o._id), o]));

    const data = rows.map((t) => formatUserTrade(t, userId, orderById));

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

export async function listUserReferrals(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return error(res, 'Invalid user id', 400);
    }

    const dt = parseDatatableQuery(req.query);
    const filter = { referredBy: userId };
    const re = searchRegex(dt.search);
    if (re) {
      filter.$or = [{ email: re }, { mobile: re }, { name: re }, { referralCode: re }];
    }
    if (req.query.status) filter.status = req.query.status;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('+passwordPlain -passwordHash')
        .sort(dt.sort)
        .skip(dt.skip)
        .limit(dt.pageSize)
        .lean(),
      User.countDocuments(filter),
    ]);

    const wallets = await Wallet.find({ userId: { $in: users.map((u) => u._id) } }).lean();
    const walletMap = new Map(wallets.map((w) => [String(w.userId), w]));

    const rows = users.map((u) => {
      const w = walletMap.get(String(u._id));
      const { passwordPlain, ...rest } = u;
      return {
        ...rest,
        id: u._id,
        loginId: u.mobile || u.email || '',
        password: passwordPlain || '',
        balance: roundMoney(w?.balance || 0),
        locked_balance: roundMoney(w?.lockedBalance || 0),
        available_balance: roundMoney(Math.max(0, (w?.balance || 0) - (w?.lockedBalance || 0))),
      };
    });

    return success(
      res,
      paginatedPayload({ rows, total, page: dt.page, pageSize: dt.pageSize }),
      'Referred users fetched'
    );
  } catch (e) {
    return next(e);
  }
}
