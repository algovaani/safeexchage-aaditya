import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';

export async function createOrder(req, res, next) {
  try {
    const { symbol, side, orderType, quantity, price, stopLoss, takeProfit } = req.body;

    if (orderType === 'limit' && (price == null || price <= 0)) {
      return res.status(400).json({ error: 'Limit orders require price' });
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

    res.status(201).json(order);
  } catch (e) {
    next(e);
  }
}

export async function listOrders(req, res, next) {
  try {
    const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200).lean();
    res.json(orders);
  } catch (e) {
    next(e);
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
    res.json(trades);
  } catch (e) {
    next(e);
  }
}
