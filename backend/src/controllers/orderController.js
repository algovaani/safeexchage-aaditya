import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { error, success } from '../utils/response.js';

export async function createOrder(req, res, next) {
  try {
    const { symbol, side, orderType, quantity, price, stopLoss, takeProfit } = req.body;

    if (orderType === 'limit' && (price == null || price <= 0)) {
      return error(res, 'Limit orders require price', 400);
    }

    const order = await Order.create({
      userId: req.userId,
      symbol: symbol.toUpperCase(),
      side,
      orderType,
      quantity,
      price: orderType === 'limit' ? price : null,
      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,
    });

    return success(res, order, 'Order created', 201);
  } catch (e) {
    return next(e);
  }
}

export async function listOrders(req, res, next) {
  try {
    const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200).lean();
    return success(res, orders, 'Orders fetched');
  } catch (e) {
    return next(e);
  }
}

export async function listTrades(req, res, next) {
  try {
    const trades = await Trade.find({
      $or: [{ buyerUserId: req.userId }, { sellerUserId: req.userId }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return success(res, trades, 'Trades fetched');
  } catch (e) {
    return next(e);
  }
}
