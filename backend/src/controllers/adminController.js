import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { ManualPriceData } from '../models/ManualPriceData.js';
import { Trade } from '../models/Trade.js';
import { Order } from '../models/Order.js';
import { KycSubmission } from '../models/KycSubmission.js';
import { Deposit } from '../models/Deposit.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { mergeCandles } from '../services/mergeService.js';
import { fetchKlines } from '../services/marketDataProvider.js';
import { error, success } from '../utils/response.js';
import { roundMoney } from '../utils/money.js';
import {
  buildDateRangeFilter,
  getExportLimit,
  paginatedPayload,
  parseDatatableQuery,
  parseObjectId,
  searchRegex,
  sendCsvExport,
} from '../utils/datatable.js';

const USER_EXPORT_COLUMNS = [
  { key: 'email', label: 'Email', export: (r) => r.email || '' },
  { key: 'mobile', label: 'Mobile', export: (r) => r.mobile || '' },
  { key: 'name', label: 'Name', export: (r) => r.name || '' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'referralCode', label: 'Referral Code', export: (r) => r.referralCode || '' },
  { key: 'balance', label: 'Balance (USDT)', export: (r) => r.balance ?? 0 },
  { key: 'createdAt', label: 'Created', export: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
];

const ORDER_EXPORT_COLUMNS = [
  { key: 'userLabel', label: 'User', export: (r) => r.userLabel || '' },
  { key: 'symbol', label: 'Symbol' },
  { key: 'side', label: 'Side' },
  { key: 'orderType', label: 'Type' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'price', label: 'Price', export: (r) => r.price ?? '' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created', export: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
];

function buildUserFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  const re = searchRegex(search);
  if (re) {
    filter.$or = [{ email: re }, { mobile: re }, { name: re }, { referralCode: re }];
  }
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  return filter;
}

export async function overviewStats(_req, res, next) {
  try {
    const [users, pendingKyc, pendingDeposits, pendingWithdrawals, pendingTx, openOrders, pendingTreasurySweeps] =
      await Promise.all([
        User.countDocuments(),
        KycSubmission.countDocuments({ status: 'pending' }),
        Deposit.countDocuments({ status: 'pending' }),
        Withdrawal.countDocuments({ status: 'pending' }),
        Transaction.countDocuments({ status: 'pending' }),
        Order.countDocuments({ status: 'open' }),
        Deposit.countDocuments({
          type: 'crypto',
          status: 'approved',
          treasuryStatus: { $ne: 'swept' },
        }),
      ]);

    return success(
      res,
      {
        users,
        pendingKyc,
        pendingDeposits,
        pendingWithdrawals,
        pendingTx,
        openOrders,
        pendingTreasurySweeps,
      },
      'Overview stats fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function listUsers(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = buildUserFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').sort(dt.sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    const wallets = await Wallet.find({ userId: { $in: users.map((u) => u._id) } }).lean();
    const walletMap = new Map(wallets.map((w) => [String(w.userId), w]));

    const rows = users.map((u) => {
      const w = walletMap.get(String(u._id));
      const balance = roundMoney(w?.balance || 0);
      const locked = roundMoney(w?.lockedBalance || 0);
      const available = roundMoney(Math.max(0, (w?.balance || 0) - (w?.lockedBalance || 0)));
      return {
        ...u,
        id: u._id,
        balance,
        locked_balance: locked,
        available_balance: available,
      };
    });

    if (dt.isExport) {
      return sendCsvExport(res, 'users.csv', rows, USER_EXPORT_COLUMNS);
    }

    return success(res, paginatedPayload({ rows, total, page: dt.page, pageSize: dt.pageSize }), 'Users fetched');
  } catch (e) {
    return next(e);
  }
}

function buildOrderFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  const re = searchRegex(search);
  if (re) {
    const or = [{ symbol: re }, { side: re }, { status: re }, { orderType: re }];
    const oid = parseObjectId(search);
    if (oid) or.push({ userId: oid });
    filter.$or = or;
  }
  if (query.status) filter.status = query.status;
  if (query.side) filter.side = query.side;
  if (query.orderType) filter.orderType = query.orderType;
  if (query.symbol) filter.symbol = String(query.symbol).toUpperCase();
  return filter;
}

export async function listAllOrders(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = buildOrderFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('userId', 'email mobile name')
        .sort(dt.sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    const rows = orders.map((o) => ({
      ...o,
      id: o._id,
      userLabel: o.userId?.email || o.userId?.mobile || String(o.userId?._id || o.userId),
    }));

    if (dt.isExport) {
      return sendCsvExport(res, 'orders.csv', rows, ORDER_EXPORT_COLUMNS);
    }

    return success(res, paginatedPayload({ rows, total, page: dt.page, pageSize: dt.pageSize }), 'Orders fetched');
  } catch (e) {
    return next(e);
  }
}

export async function listPendingTransactions(_req, res, next) {
  try {
    const txs = await Transaction.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
    return success(res, txs, 'Pending transactions fetched');
  } catch (e) {
    return next(e);
  }
}

export async function listAllTransactions(_req, res, next) {
  try {
    const txs = await Transaction.find().sort({ createdAt: -1 }).limit(1000).lean();
    return success(res, txs, 'Transactions fetched');
  } catch (e) {
    return next(e);
  }
}

export async function approveTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { decision } = req.body;
    const tx = await Transaction.findById(id);
    if (!tx) return error(res, 'Transaction not found', 404);
    if (tx.status !== 'pending') return error(res, 'Transaction already processed', 400);

    if (decision === 'approve' && tx.type === 'deposit') {
      await Wallet.findOneAndUpdate(
        { userId: tx.userId },
        { $inc: { balance: tx.amount } },
        { upsert: true }
      );
      tx.status = 'completed';
    } else if (decision === 'approve' && tx.type === 'withdrawal') {
      const w = await Wallet.findOne({ userId: tx.userId });
      if (!w || w.balance < tx.amount) return error(res, 'Insufficient balance', 400);
      w.balance -= tx.amount;
      await w.save();
      tx.status = 'completed';
    } else if (decision === 'reject') {
      tx.status = 'rejected';
    } else {
      return error(res, 'Invalid decision', 400);
    }

    await tx.save();
    return success(res, tx, 'Transaction updated');
  } catch (e) {
    return next(e);
  }
}

export async function upsertManualPrice(req, res, next) {
  try {
    const body = req.body;
    const existing = await ManualPriceData.findOne({
      symbol: body.symbol.toUpperCase(),
      interval: body.interval,
      openTime: body.openTime,
    }).sort({ revision: -1 });

    const revision = (existing?.revision || 0) + 1;

    const doc = await ManualPriceData.create({
      symbol: body.symbol.toUpperCase(),
      interval: body.interval,
      openTime: body.openTime,
      mode: body.mode || 'candle',
      open: body.open,
      high: body.high,
      low: body.low,
      close: body.close,
      volume: body.volume ?? 0,
      tickTime: body.tickTime,
      price: body.price,
      revision,
      createdBy: req.userId,
    });

    const io = req.app.get('io');
    if (io) {
      const external = await fetchKlines(doc.symbol, doc.interval, {
        startTime: doc.openTime,
        endTime: doc.openTime,
        limit: 5,
      });
      const manual = await ManualPriceData.find({
        symbol: doc.symbol,
        interval: doc.interval,
        openTime: doc.openTime,
      })
        .sort({ revision: 1 })
        .lean();
      const merged = mergeCandles(external.length ? external : [stubCandle(doc)], manual);
      io.to(`m:${doc.symbol}:${doc.interval}`).emit('market:manual:updated', {
        candles: merged,
      });
    }

    return success(res, doc, 'Manual price saved', 201);
  } catch (e) {
    return next(e);
  }
}

function stubCandle(doc) {
  return {
    openTime: doc.openTime,
    open: doc.open ?? doc.price ?? 0,
    high: doc.high ?? doc.price ?? 0,
    low: doc.low ?? doc.price ?? 0,
    close: doc.close ?? doc.price ?? 0,
    volume: doc.volume ?? 0,
    isFinal: true,
  };
}

export async function listManualPrices(req, res, next) {
  try {
    const { symbol, interval } = req.query;
    const q = {};
    if (symbol) q.symbol = String(symbol).toUpperCase();
    if (interval) q.interval = String(interval);
    const rows = await ManualPriceData.find(q).sort({ openTime: -1 }).limit(200).lean();
    return success(res, rows, 'Manual prices fetched');
  } catch (e) {
    return next(e);
  }
}

export async function deleteManualPrice(req, res, next) {
  try {
    await ManualPriceData.findByIdAndDelete(req.params.id);
    return success(res, { deleted: true }, 'Manual price deleted');
  } catch (e) {
    return next(e);
  }
}

export async function allTrades(_req, res, next) {
  try {
    const trades = await Trade.find().sort({ createdAt: -1 }).limit(500).lean();
    return success(res, trades, 'Exchange trades fetched');
  } catch (e) {
    return next(e);
  }
}
