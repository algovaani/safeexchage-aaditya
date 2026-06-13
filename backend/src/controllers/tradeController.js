import mongoose from 'mongoose';
import { AdminTrade } from '../models/AdminTrade.js';
import { UserOrder } from '../models/UserOrder.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { KycSubmission } from '../models/KycSubmission.js';
import { fetchPriceMap } from '../services/binanceService.js';
import { calculatePnL } from '../services/settlementService.js';
import { error, success } from '../utils/response.js';
import { roundMoney, storeMoney } from '../utils/money.js';

const MIN_MARGIN = 10;

function formatTradeSummary(trade, pair) {
  return {
    id: trade._id,
    pair: pair?.displayPair || pair?.symbol || null,
    symbol: pair?.symbol || null,
    entryPrice: roundMoney(trade.entryPrice),
    takeProfit: roundMoney(trade.takeProfit),
    stopLoss: roundMoney(trade.stopLoss),
    leverage: trade.leverage,
    status: trade.status,
  };
}

export async function getOpenTrades(_req, res, next) {
  try {
    const trades = await AdminTrade.find({ status: 'open' })
      .populate('pairId')
      .sort({ createdAt: -1 })
      .lean();

    const data = trades.map((trade) => formatTradeSummary(trade, trade.pairId));
    return success(res, data, 'Open trades fetched');
  } catch (e) {
    return next(e);
  }
}

export async function joinTrade(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { trade_id, margin_amount } = req.body;
    const margin = storeMoney(margin_amount);

    if (margin < MIN_MARGIN) {
      await session.abortTransaction();
      return error(res, `Minimum margin is ${MIN_MARGIN} USDT`, 400);
    }

    const kyc = await KycSubmission.findOne({ userId: req.userId, status: 'approved' }).session(session);
    if (!kyc) {
      await session.abortTransaction();
      return error(res, 'Approved KYC is required to join trades', 403);
    }

    const trade = await AdminTrade.findById(trade_id).session(session);
    if (!trade || trade.status !== 'open') {
      await session.abortTransaction();
      return error(res, 'Trade not found or not open', 400);
    }

    const existing = await UserOrder.findOne({
      userId: req.userId,
      tradeId: trade_id,
      status: 'open',
    }).session(session);
    if (existing) {
      await session.abortTransaction();
      return error(res, 'You already have an open position on this trade', 409);
    }

    const wallet = await Wallet.findOne({ userId: req.userId }).session(session);
    if (!wallet || wallet.balance < margin) {
      await session.abortTransaction();
      return error(res, 'Insufficient USDT balance', 400);
    }

    wallet.balance = storeMoney(wallet.balance - margin);
    wallet.lockedBalance = storeMoney((wallet.lockedBalance || 0) + margin);
    await wallet.save({ session });

    const [order] = await UserOrder.create(
      [
        {
          userId: req.userId,
          tradeId: trade._id,
          marginAmount: margin,
          entryPrice: storeMoney(trade.entryPrice),
          status: 'open',
        },
      ],
      { session }
    );

    await Transaction.create(
      [
        {
          userId: req.userId,
          type: 'trade_margin_locked',
          amount: roundMoney(-margin),
          balanceAfter: roundMoney(wallet.balance),
          currency: 'USDT',
          status: 'completed',
          orderId: order._id,
          tradeId: trade._id,
          reference: `trade_margin_locked:${order._id}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return success(res, {
        orderId: order._id,
        tradeId: trade._id,
        marginAmount: roundMoney(margin),
        entryPrice: roundMoney(trade.entryPrice),
        balance: roundMoney(wallet.balance),
        lockedBalance: roundMoney(wallet.lockedBalance),
      }, 'Joined trade successfully', 201);
  } catch (e) {
    await session.abortTransaction();
    return next(e);
  } finally {
    session.endSession();
  }
}

export async function getOpenPositions(req, res, next) {
  try {
    const orders = await UserOrder.find({ userId: req.userId, status: 'open' })
      .sort({ createdAt: -1 })
      .lean();

    const tradeIds = [...new Set(orders.map((o) => String(o.tradeId)))];
    const trades = await AdminTrade.find({ _id: { $in: tradeIds } }).populate('pairId').lean();
    const tradeMap = new Map(trades.map((t) => [String(t._id), t]));

    const { prices, stale } = await fetchPriceMap();

    const positions = orders.map((order) => {
      const trade = tradeMap.get(String(order.tradeId));
      const pair = trade?.pairId;
      const symbol = pair?.symbol;
      const currentPrice = symbol ? prices[symbol] ?? trade.entryPrice : trade?.entryPrice;
      const { pnl, pnl_percent } = calculatePnL(
        order.entryPrice,
        currentPrice,
        order.marginAmount,
        trade?.leverage || 1
      );

      return {
        orderId: order._id,
        marginAmount: roundMoney(order.marginAmount),
        entryPrice: roundMoney(order.entryPrice),
        currentPrice: roundMoney(currentPrice),
        unrealized_pnl: pnl,
        unrealized_pnl_percent: pnl_percent,
        openedAt: order.createdAt,
        trade: trade ? formatTradeSummary(trade, pair) : null,
        priceStale: stale,
      };
    });

    return success(res, positions, 'Open positions fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getTradeHistory(req, res, next) {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const filter = {
      userId: req.userId,
      status: { $in: ['closed', 'cancelled'] },
    };

    const [orders, total] = await Promise.all([
      UserOrder.find(filter).sort({ closedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      UserOrder.countDocuments(filter),
    ]);

    const tradeIds = [...new Set(orders.map((o) => String(o.tradeId)))];
    const trades = await AdminTrade.find({ _id: { $in: tradeIds } }).populate('pairId').lean();
    const tradeMap = new Map(trades.map((t) => [String(t._id), t]));

    const items = orders.map((order) => {
      const trade = tradeMap.get(String(order.tradeId));
      const pair = trade?.pairId;
      return {
        orderId: order._id,
        status: order.status,
        marginAmount: roundMoney(order.marginAmount),
        entryPrice: roundMoney(order.entryPrice),
        closePrice: order.closePrice != null ? roundMoney(order.closePrice) : null,
        pnl: roundMoney(order.pnl),
        closedAt: order.closedAt,
        trade: trade ? formatTradeSummary(trade, pair) : null,
      };
    });

    return success(res, {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    }, 'Trade history fetched');
  } catch (e) {
    return next(e);
  }
}
