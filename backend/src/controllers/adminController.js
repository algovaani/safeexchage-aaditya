import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { ManualPriceData } from '../models/ManualPriceData.js';
import { Trade } from '../models/Trade.js';
import { Order } from '../models/Order.js';
import { KycSubmission } from '../models/KycSubmission.js';
import { Deposit } from '../models/Deposit.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { CashInPersonRequest } from '../models/CashInPersonRequest.js';
import { mergeCandles } from '../services/mergeService.js';
import { fetchKlines, fetchTicker, fetchDepth } from '../services/marketDataProvider.js';
import { processOrdersForPrice } from '../services/orderEngine.js';
import { listActivePulses, schedulePulseRevert, setPricePulse } from '../services/pricePulseService.js';
import {
  alignOpenTime,
  buildMemoryPulseFlash,
  finalizePulseAfterRevert,
  persistPulseWick,
} from '../services/pulseHistoryService.js';
import { broadcastPulseToSockets, depthRoom, emitCandle, ensureMarketStream, resetPulseStreamState } from '../services/marketStreamService.js';
import {
  clearTickerStatsOverride,
  listTickerStatsOverrides,
  upsertTickerStatsOverride,
} from '../services/tickerStatsOverrideService.js';
import { error, success } from '../utils/response.js';
import { roundMoney } from '../utils/money.js';
import { z } from 'zod';
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
  { key: 'loginId', label: 'Login ID', export: (r) => r.loginId || '' },
  { key: 'password', label: 'Password', export: (r) => r.password || '' },
  { key: 'referralCode', label: 'Referral Code', export: (r) => r.referralCode || '' },
  { key: 'referredByLabel', label: 'Referred By', export: (r) => r.referredByLabel || '' },
  { key: 'invitedCount', label: 'Referral Joins', export: (r) => r.invitedCount ?? 0 },
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

async function buildUserFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  const re = searchRegex(search);
  if (re) {
    const or = [{ email: re }, { mobile: re }, { name: re }, { referralCode: re }];
    const code = String(search || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (code.length >= 3) {
      const referrer = await User.findOne({ referralCode: code }).select('_id referralCode').lean();
      if (referrer) {
        or.push({ referredBy: referrer._id });
        or.push({ _id: referrer._id });
      }
    }
    filter.$or = or;
  }
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  return filter;
}

export async function overviewStats(_req, res, next) {
  try {
    const [users, pendingKyc, pendingDeposits, pendingWithdrawals, pendingCashInPerson, pendingTx, openOrders, pendingTreasurySweeps] =
      await Promise.all([
        User.countDocuments(),
        KycSubmission.countDocuments({ status: 'pending' }),
        Deposit.countDocuments({ status: 'pending' }),
        Withdrawal.countDocuments({ status: 'pending' }),
        CashInPersonRequest.countDocuments({ status: 'pending' }),
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
        pendingCashInPerson,
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
    const filter = await buildUserFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('+passwordPlain -passwordHash')
        .sort(dt.sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id);
    const referrerIds = [
      ...new Set(users.map((u) => u.referredBy).filter(Boolean).map((id) => String(id))),
    ];

    const [wallets, referrers, inviteAgg] = await Promise.all([
      Wallet.find({ userId: { $in: userIds } }).lean(),
      referrerIds.length
        ? User.find({ _id: { $in: referrerIds } })
            .select('email mobile name referralCode')
            .lean()
        : Promise.resolve([]),
      userIds.length
        ? User.aggregate([
            { $match: { referredBy: { $in: userIds } } },
            { $group: { _id: '$referredBy', count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
    ]);

    const walletMap = new Map(wallets.map((w) => [String(w.userId), w]));
    const referrerMap = new Map(referrers.map((r) => [String(r._id), r]));
    const inviteMap = new Map(inviteAgg.map((row) => [String(row._id), row.count]));

    const rows = users.map((u) => {
      const w = walletMap.get(String(u._id));
      const balance = roundMoney(w?.balance || 0);
      const locked = roundMoney(w?.lockedBalance || 0);
      const available = roundMoney(Math.max(0, (w?.balance || 0) - (w?.lockedBalance || 0)));
      const ref = u.referredBy ? referrerMap.get(String(u.referredBy)) : null;
      const referredByLabel = ref
        ? ref.referralCode || ref.email || ref.mobile || ref.name || String(u.referredBy)
        : null;
      const { passwordPlain, ...rest } = u;
      return {
        ...rest,
        id: u._id,
        loginId: u.mobile || u.email || '',
        password: passwordPlain || '',
        referredByLabel,
        invitedCount: inviteMap.get(String(u._id)) || 0,
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

export const pricePulseSchema = z.object({
  symbol: z.string().min(3),
  price: z.number().positive(),
  holdMs: z.number().int().min(600).max(5_000).optional(),
});

/**
 * One-shot pulse: memory spike → sockets everywhere → fill orders → revert to Binance.
 * No Mongo wait on the hot path (smooth UX, no server stack).
 */
export async function pulsePrice(req, res, next) {
  try {
    const symbol = String(req.body.symbol || '').toUpperCase();
    const pulsePriceValue = Number(req.body.price);
    const holdMs = Number(req.body.holdMs) || 4500;

    if (!symbol || !Number.isFinite(pulsePriceValue) || pulsePriceValue <= 0) {
      return error(res, 'symbol and positive price are required', 400);
    }

    // Prefer cached live mid — don't block pulse on slow Binance
    let fromPrice = pulsePriceValue;
    try {
      const ticker = await fetchTicker(symbol, { force: false });
      fromPrice = Number(ticker?.price ?? ticker?.lastPrice) || pulsePriceValue;
    } catch {
      /* use pulse as fallback baseline */
    }

    const pulse = setPricePulse(symbol, pulsePriceValue, { fromPrice, holdMs });
    const flash = buildMemoryPulseFlash({
      symbol,
      fromPrice,
      pulsePrice: pulsePriceValue,
      holdMs: pulse.holdMs,
    });

    const io = req.app.get('io');
    const intervals = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'];

    // 1) Broadcast FIRST so every open Trading/Markets tab sees the spike instantly
    broadcastPulseToSockets(io, {
      symbol,
      intervalCandles: flash.candles,
      depth: flash.depth,
      trade: {
        price: pulsePriceValue,
        fromPrice,
        until: pulse.until,
        qty: Math.max(0.01, Math.abs(pulsePriceValue - fromPrice) * 0.001),
        quantity: Math.max(0.01, Math.abs(pulsePriceValue - fromPrice) * 0.001),
        time: Date.now(),
        isBuyerMaker: pulsePriceValue < fromPrice,
        pulse: true,
      },
    });

    // 2) Persist wick BEFORE response so refresh always shows the spike
    let historySaved = 0;
    let manualsSaved = 0;
    try {
      const wick = await persistPulseWick({
        symbol,
        fromPrice,
        pulsePrice: pulsePriceValue,
        openTimes: flash.openTimes,
        adminId: req.userId,
      });
      historySaved = wick.saved || 0;
      manualsSaved = wick.manuals || 0;
    } catch (err) {
      console.warn(`[pulse] persist wick ${symbol}:`, err.message);
    }

    // 3) Respond — order fills / streams happen in background
    const responsePayload = {
      symbol,
      fromPrice,
      price: pulsePriceValue,
      until: pulse.until,
      holdMs: pulse.holdMs,
      historySaved,
      manualsSaved,
      filledOrders: 0,
      mode: 'persisted-wick',
    };

    setImmediate(async () => {
      try {
        const trades = await processOrdersForPrice(symbol, pulsePriceValue, {
          fromPrice,
          rangeOnly: true,
        });
        responsePayload.filledOrders = trades.length;

        if (io) {
          for (const interval of intervals) {
            try {
              ensureMarketStream(io, symbol, interval);
            } catch {
              /* ignore */
            }
          }
          if (trades.length) {
            const { emitWalletUpdate } = await import('../services/socketService.js');
            const userIds = new Set();
            for (const t of trades) {
              if (t.buyerUserId) userIds.add(String(t.buyerUserId));
              if (t.sellerUserId) userIds.add(String(t.sellerUserId));
            }
            for (const uid of userIds) {
              emitWalletUpdate(io, uid, { reason: 'pulse_fill' }).catch(() => {});
            }
            io.emit('market:orders:filled', {
              symbol,
              count: trades.length,
              at: Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn(`[pulse] fill/stream ${symbol}:`, err.message);
      }
    });

    // 4) After hold → market close + KEEP pulse wick (persisted)
    schedulePulseRevert(symbol, pulse.holdMs, async () => {
      if (!io) return;
      let marketPrice = fromPrice;
      try {
        const ticker = await fetchTicker(symbol, { force: true });
        marketPrice = Number(ticker?.price ?? ticker?.lastPrice) || fromPrice;
      } catch {
        /* keep fromPrice */
      }

      const wickHi = Math.max(marketPrice, pulsePriceValue, fromPrice);
      const wickLo = Math.min(marketPrice, pulsePriceValue, fromPrice);

      resetPulseStreamState(symbol);
      try {
        await finalizePulseAfterRevert(symbol, marketPrice, {
          openTimes: flash.openTimes,
          pulsedPrice: pulsePriceValue,
          fromPrice,
          adminId: req.userId,
        });
      } catch (err) {
        console.warn(`[pulse] finalize ${symbol}:`, err.message);
      }

      io.emit('market:price:pulse:end', {
        symbol,
        price: marketPrice,
        fromPrice,
        pulsedPrice: pulsePriceValue,
        high: wickHi,
        low: wickLo,
        reloadChart: false,
      });

      io.to(depthRoom(symbol)).emit('market:trade', {
        symbol,
        price: marketPrice,
        qty: 0,
        time: Date.now(),
        tickerOnly: true,
        pulse: false,
      });

      // Emit restored candle WITH pulse wick so chart keeps the spike
      for (const interval of intervals) {
        const aligned =
          flash.openTimes?.[interval] ?? alignOpenTime(Date.now(), interval);
        const candle = {
          openTime: aligned,
          open: fromPrice,
          high: wickHi,
          low: wickLo,
          close: marketPrice,
          volume: 1,
          isFinal: false,
          pulse: false,
          _forceChart: true,
        };
        emitCandle(io, symbol, interval, candle);
        io.to(depthRoom(symbol)).emit('market:klines:merged', {
          symbol,
          interval,
          candle,
        });
      }

      fetchDepth(symbol, { limit: 20 })
        .then((marketDepth) => {
          if (!marketDepth?.bids?.length && !marketDepth?.asks?.length) return;
          io.to(depthRoom(symbol)).emit('market:depth', {
            symbol,
            ...marketDepth,
            pulse: false,
          });
          io.to(`m:${symbol}:1s`).emit('market:depth', {
            symbol,
            ...marketDepth,
            pulse: false,
          });
        })
        .catch(() => {});
    });

    return success(res, responsePayload, 'Price pulsed');
  } catch (e) {
    return next(e);
  }
}

export async function listPricePulses(req, res, next) {
  try {
    return success(res, listActivePulses(), 'Active price pulses');
  } catch (e) {
    return next(e);
  }
}

export async function listTickerStats(req, res, next) {
  try {
    const rows = await listTickerStatsOverrides();
    return success(res, rows, 'Ticker stats overrides fetched');
  } catch (e) {
    return next(e);
  }
}

export async function upsertTickerStats(req, res, next) {
  try {
    const symbol = req.params.symbol || req.body.symbol;
    const row = await upsertTickerStatsOverride(symbol, req.body, req.userId);
    return success(res, row, 'Ticker stats override saved');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function clearTickerStats(req, res, next) {
  try {
    const result = await clearTickerStatsOverride(req.params.symbol);
    return success(res, result, 'Ticker stats override cleared');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
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
