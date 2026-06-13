import mongoose from 'mongoose';
import { AdminTrade } from '../../models/AdminTrade.js';
import { UserOrder } from '../../models/UserOrder.js';
import { TradingPair } from '../../models/TradingPair.js';
import { fetchTicker } from '../../services/binanceService.js';
import {
  cancelTradeAndReleaseMargins,
  estimateOrderPnl,
  settleAllOrdersForTrade,
} from '../../services/settlementService.js';
import { error, success } from '../../utils/response.js';

function formatTrade(row, stats = {}) {
  const pair = row.pairId;
  return {
    id: row._id,
    pairId: pair?._id || row.pairId,
    symbol: pair?.symbol || null,
    displayPair: pair?.displayPair || null,
    entryPrice: row.entryPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    leverage: row.leverage,
    description: row.description || '',
    status: row.status,
    closePrice: row.closePrice,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    totalOrders: stats.totalOrders ?? 0,
    totalVolume: stats.totalVolume ?? 0,
  };
}

function formatUserOrder(order, trade, markPrice) {
  const user = order.userId;
  const estimatedPnl =
    order.status === 'open' ? estimateOrderPnl(order, trade, markPrice) : order.pnl;

  return {
    id: order._id,
    userId: user?._id || order.userId,
    email: user?.email || null,
    mobile: user?.mobile || null,
    marginAmount: order.marginAmount,
    entryPrice: order.entryPrice,
    status: order.status,
    pnl: order.pnl,
    estimatedPnl,
    closedAt: order.closedAt,
    createdAt: order.createdAt,
  };
}

async function aggregateTradeStats(tradeIds) {
  if (!tradeIds.length) return new Map();

  const rows = await UserOrder.aggregate([
    { $match: { tradeId: { $in: tradeIds } } },
    {
      $group: {
        _id: '$tradeId',
        totalOrders: { $sum: 1 },
        totalVolume: { $sum: '$marginAmount' },
      },
    },
  ]);

  return new Map(rows.map((r) => [String(r._id), r]));
}

async function resolveMarkPrice(trade) {
  const pair = await TradingPair.findById(trade.pairId).lean();
  if (!pair?.symbol) return trade.entryPrice;
  try {
    const ticker = await fetchTicker(pair.symbol);
    return ticker.price;
  } catch {
    return trade.entryPrice;
  }
}

export async function createTrade(req, res, next) {
  try {
    const { pair_id, entry_price, take_profit, stop_loss, leverage, description } = req.body;

    const pair = await TradingPair.findOne({ _id: pair_id, isActive: true });
    if (!pair) {
      return error(res, 'Trading pair not found or inactive', 400);
    }

    const trade = await AdminTrade.create({
      pairId: pair._id,
      entryPrice: entry_price,
      takeProfit: take_profit,
      stopLoss: stop_loss,
      leverage,
      description: description || '',
      status: 'open',
      createdBy: req.userId,
    });

    await trade.populate('pairId', 'symbol displayPair baseAsset quoteAsset');
    return success(res, formatTrade(trade.toObject()), 'Admin trade created', 201);
  } catch (e) {
    return next(e);
  }
}

export async function getAllTrades(req, res, next) {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    if (req.query.pair_id) {
      filter.pairId = new mongoose.Types.ObjectId(req.query.pair_id);
    }

    const [rows, total] = await Promise.all([
      AdminTrade.find(filter)
        .populate('pairId', 'symbol displayPair')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminTrade.countDocuments(filter),
    ]);

    const statsMap = await aggregateTradeStats(rows.map((r) => r._id));
    const items = rows.map((row) => {
      const stats = statsMap.get(String(row._id)) || {};
      return formatTrade(row, {
        totalOrders: stats.totalOrders || 0,
        totalVolume: stats.totalVolume || 0,
      });
    });

    return success(res, {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    }, 'Trades fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getTradeById(req, res, next) {
  try {
    const trade = await AdminTrade.findById(req.params.id)
      .populate('pairId', 'symbol displayPair baseAsset quoteAsset')
      .lean();

    if (!trade) {
      return error(res, 'Trade not found', 404);
    }

    const statsMap = await aggregateTradeStats([trade._id]);
    const stats = statsMap.get(String(trade._id)) || {};

    const orders = await UserOrder.find({ tradeId: trade._id })
      .populate('userId', 'email mobile name')
      .sort({ createdAt: -1 })
      .lean();

    const markPrice = trade.status === 'open' ? await resolveMarkPrice(trade) : trade.closePrice;

    return success(res, {
      trade: formatTrade(trade, {
        totalOrders: stats.totalOrders || 0,
        totalVolume: stats.totalVolume || 0,
      }),
      orders: orders.map((o) => formatUserOrder(o, trade, markPrice)),
      markPrice,
    }, 'Trade detail fetched');
  } catch (e) {
    return next(e);
  }
}

export async function updateTradeStatus(req, res, next) {
  try {
    const { action, close_price } = req.body;
    const tradeId = req.params.id;

    let result;
    if (action === 'close') {
      result = await settleAllOrdersForTrade(tradeId, close_price);
      return success(res, {
        tradeId,
        status: 'closed',
        closePrice: close_price,
        settled_count: result.settled_count,
        total_pnl_distributed: result.total_pnl_distributed,
      }, 'Trade closed and orders settled');
    }

    result = await cancelTradeAndReleaseMargins(tradeId);
    return success(res, {
      tradeId,
      status: 'cancelled',
      cancelledOrders: result.cancelledOrders,
    }, 'Trade cancelled and margins released');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function getTradeOrders(req, res, next) {
  try {
    const trade = await AdminTrade.findById(req.params.id).lean();
    if (!trade) {
      return error(res, 'Trade not found', 404);
    }

    const orders = await UserOrder.find({ tradeId: trade._id })
      .populate('userId', 'email mobile name')
      .sort({ createdAt: -1 })
      .lean();

    const markPrice = trade.status === 'open' ? await resolveMarkPrice(trade) : trade.closePrice;

    return success(res, {
      tradeId: trade._id,
      status: trade.status,
      markPrice,
      orders: orders.map((o) => formatUserOrder(o, trade, markPrice)),
    }, 'Trade orders fetched');
  } catch (e) {
    return next(e);
  }
}
