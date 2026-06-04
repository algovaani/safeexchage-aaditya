import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { Wallet } from '../models/Wallet.js';
import { User } from '../models/User.js';

const FEE_RATE = 0.001;

let liquidityUserIdPromise = null;

async function getLiquidityUserId() {
  if (!liquidityUserIdPromise) {
    liquidityUserIdPromise = User.findOne({
      email: process.env.SYSTEM_LIQUIDITY_EMAIL || 'liquidity@internal.vencrypto',
    }).then((u) => u?._id || null);
  }
  return liquidityUserIdPromise;
}

/**
 * On each merged price tick, try to fill open orders (simulated internal liquidity).
 */
export async function processOrdersForPrice(symbol, currentPrice) {
  const sym = symbol.toUpperCase();
  const liquidityId = await getLiquidityUserId();
  const openOrders = await Order.find({
    symbol: sym,
    status: { $in: ['open', 'partially_filled'] },
  }).sort({ createdAt: 1 });

  const trades = [];

  for (const order of openOrders) {
    let shouldFill = false;
    let fillPrice = currentPrice;

    if (order.orderType === 'market') {
      shouldFill = true;
    } else if (order.orderType === 'limit' && order.price != null) {
      if (order.side === 'buy' && currentPrice <= order.price) shouldFill = true;
      if (order.side === 'sell' && currentPrice >= order.price) shouldFill = true;
      fillPrice = order.price;
    }

    if (!shouldFill) continue;

    const remaining = order.quantity - order.filledQuantity;
    if (remaining <= 0) continue;

    const t = await executeInternalFill(order, fillPrice, remaining, sym, liquidityId);
    if (t) trades.push(t);
  }

  return trades;
}

async function executeInternalFill(order, price, qty, symbol, liquidityId) {
  const userId = order.userId;
  const notional = price * qty;
  const fee = notional * FEE_RATE;

  const wallet = await Wallet.findOne({ userId });
  if (!wallet) return null;

  if (order.side === 'buy') {
    const cost = notional + fee;
    if (wallet.balance < cost) {
      await Order.findByIdAndUpdate(order._id, { status: 'rejected' });
      return null;
    }
    wallet.balance -= cost;
  } else {
    wallet.balance += notional - fee;
  }

  await wallet.save();

  const buyOrderId = order.side === 'buy' ? order._id : order._id;
  const sellOrderId = order.side === 'sell' ? order._id : order._id;
  const buyerUserId = order.side === 'buy' ? userId : liquidityId || userId;
  const sellerUserId = order.side === 'sell' ? userId : liquidityId || userId;

  await Order.findByIdAndUpdate(order._id, {
    status: 'filled',
    filledQuantity: order.filledQuantity + qty,
    avgFillPrice: price,
  });

  const trade = await Trade.create({
    symbol,
    price,
    quantity: qty,
    buyerUserId,
    sellerUserId,
    buyOrderId,
    sellOrderId,
    fee,
  });

  return trade;
}
