import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { Wallet } from '../models/Wallet.js';
import { error, success } from '../utils/response.js';
import { fetchTicker } from '../services/binanceService.js';
import { processOrdersForPrice } from '../services/orderEngine.js';

const FEE_RATE = 0.001;

async function assertBuyAffordable(userId, { symbol, orderType, quantity, price }) {
  const wallet = await Wallet.findOne({ userId });
  const available = (wallet?.balance || 0) - (wallet?.lockedBalance || 0);

  let unitPrice = price;
  if (orderType === 'market') {
    const ticker = await fetchTicker(symbol);
    unitPrice = Number(ticker.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw Object.assign(new Error('Market price unavailable'), { status: 503 });
    }
  }

  const cost = unitPrice * quantity * (1 + FEE_RATE);
  if (!wallet || available < cost) {
    throw Object.assign(new Error('Insufficient available balance'), { status: 400 });
  }
}

export async function createOrder(req, res, next) {
  try {
    const { symbol, side, orderType, quantity, price, stopLoss, takeProfit } = req.body;
    const sym = symbol.toUpperCase();

    if (orderType === 'limit' && (price == null || price <= 0)) {
      return error(res, 'Limit orders require price', 400);
    }

    if (side === 'buy') {
      await assertBuyAffordable(req.userId, { symbol: sym, orderType, quantity, price });
    }

    const order = await Order.create({
      userId: req.userId,
      symbol: sym,
      side,
      orderType,
      quantity,
      price: orderType === 'limit' ? price : null,
      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,
    });

    try {
      const ticker = await fetchTicker(sym);
      const marketPrice = Number(ticker.price);
      if (Number.isFinite(marketPrice) && marketPrice > 0) {
        await processOrdersForPrice(sym, marketPrice);
      }
    } catch (fillErr) {
      console.warn('order fill on create:', fillErr.message);
    }

    const updated = await Order.findById(order._id).lean();
    const finalOrder = updated || order.toObject();
    const message =
      finalOrder.status === 'filled'
        ? 'Order filled at market price'
        : finalOrder.status === 'rejected'
          ? 'Order rejected (insufficient balance)'
          : 'Order created';

    return success(res, finalOrder, message, 201);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
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
