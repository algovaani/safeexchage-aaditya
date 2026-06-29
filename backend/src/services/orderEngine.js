import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import {
  baseAssetFromSymbol,
  creditAsset,
  debitAsset,
} from './assetBalanceService.js';
import { roundMoney, storeMoney } from '../utils/money.js';

const FEE_RATE = 0.001;

/** Serialize order fills per symbol so concurrent price ticks cannot double-execute. */
const symbolOrderChains = new Map();

function withSymbolOrderLock(symbol, fn) {
  const sym = symbol.toUpperCase();
  const prev = symbolOrderChains.get(sym) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  symbolOrderChains.set(sym, run);
  return run.finally(() => {
    if (symbolOrderChains.get(sym) === run) {
      symbolOrderChains.delete(sym);
    }
  });
}

let liquidityUserIdPromise = null;

async function getLiquidityUserId() {
  if (!liquidityUserIdPromise) {
    liquidityUserIdPromise = User.findOne({
      email: process.env.SYSTEM_LIQUIDITY_EMAIL || 'liquidity@internal.safex',
    }).then((u) => u?._id || null);
  }
  return liquidityUserIdPromise;
}

/**
 * On each merged price tick, try to fill open orders (simulated internal liquidity).
 */
export async function processOrdersForPrice(symbol, currentPrice) {
  return withSymbolOrderLock(symbol, () => processOrdersForPriceUnlocked(symbol, currentPrice));
}

async function processOrdersForPriceUnlocked(symbol, currentPrice) {
  const sym = symbol.toUpperCase();
  const liquidityId = await getLiquidityUserId();
  const openOrders = await Order.find({
    symbol: sym,
    status: { $in: ['open', 'partially_filled'] },
  }).sort({ createdAt: 1 });

  const trades = [];

  for (const order of openOrders) {
    const fresh = await Order.findById(order._id).lean();
    if (!fresh || !['open', 'partially_filled'].includes(fresh.status)) continue;

    let shouldFill = false;
    let fillPrice = currentPrice;

    if (fresh.orderType === 'market') {
      shouldFill = true;
    } else if (fresh.orderType === 'limit' && fresh.price != null) {
      if (fresh.side === 'buy' && currentPrice <= fresh.price) shouldFill = true;
      if (fresh.side === 'sell' && currentPrice >= fresh.price) shouldFill = true;
      fillPrice = fresh.price;
    }

    if (!shouldFill) continue;

    const remaining = fresh.quantity - (fresh.filledQuantity || 0);
    if (remaining <= 0) continue;

    const t = await executeInternalFill(fresh, fillPrice, remaining, sym, liquidityId);
    if (t) trades.push(t);
  }

  return trades;
}

async function logSpotTransaction(userId, side, { symbol, quantity, price, fee, orderId, tradeId }) {
  const wallet = await Wallet.findOne({ userId }).lean();
  const notional = price * quantity;
  const amount = side === 'buy' ? notional + fee : notional - fee;

  await Transaction.create({
    userId,
    type: side === 'buy' ? 'spot_buy' : 'spot_sell',
    amount: roundMoney(amount),
    balanceAfter: roundMoney(wallet?.balance || 0),
    currency: 'USDT',
    status: 'completed',
    method: 'gateway',
    reference: `${symbol} ${side} ${quantity} @ ${price}`,
    spotOrderId: orderId,
    spotTradeId: tradeId,
  });
}

async function executeInternalFill(order, price, qty, symbol, liquidityId) {
  const orderId = order._id;
  const userId = order.userId;
  const baseAsset = baseAssetFromSymbol(symbol);

  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: ['open', 'partially_filled'] },
      filledQuantity: order.filledQuantity || 0,
      $expr: { $gte: [{ $subtract: ['$quantity', '$filledQuantity'] }, qty - 1e-10] },
    },
    {
      $inc: { filledQuantity: qty },
      $set: {
        avgFillPrice: price,
        status: order.filledQuantity + qty >= order.quantity - 1e-10 ? 'filled' : 'partially_filled',
      },
    },
    { new: true }
  );

  if (!claimed) return null;

  let wallet = await Wallet.findOne({ userId });

  if (!wallet && order.side === 'buy') {
    await Order.findByIdAndUpdate(orderId, {
      status: 'rejected',
      filledQuantity: order.filledQuantity || 0,
      avgFillPrice: order.avgFillPrice ?? null,
    });
    return null;
  }

  if (!wallet && order.side === 'sell') {
    wallet = await Wallet.create({ userId, balance: 0, lockedBalance: 0 });
  }

  const notional = price * qty;
  const fee = storeMoney(notional * FEE_RATE);

  try {
    if (order.side === 'buy') {
      const cost = storeMoney(notional + fee);
      const available = wallet.balance - (wallet.lockedBalance || 0);
      if (available + 1e-10 < cost) {
        await Order.findByIdAndUpdate(orderId, {
          status: 'rejected',
          filledQuantity: order.filledQuantity || 0,
          avgFillPrice: order.avgFillPrice ?? null,
        });
        return null;
      }
      wallet.balance = storeMoney(wallet.balance - cost);
      await wallet.save();
      await creditAsset(userId, baseAsset, qty);
    } else {
      await debitAsset(userId, baseAsset, qty);
      wallet.balance = storeMoney(wallet.balance + notional - fee);
      await wallet.save();
    }
  } catch (err) {
    await Order.findByIdAndUpdate(orderId, {
      status: 'rejected',
      filledQuantity: order.filledQuantity || 0,
      avgFillPrice: order.avgFillPrice ?? null,
    });
    return null;
  }

  const buyOrderId = orderId;
  const sellOrderId = orderId;
  const buyerUserId = order.side === 'buy' ? userId : liquidityId || userId;
  const sellerUserId = order.side === 'sell' ? userId : liquidityId || userId;

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

  await logSpotTransaction(userId, order.side, {
    symbol,
    quantity: qty,
    price,
    fee,
    orderId,
    tradeId: trade._id,
  });

  return trade;
}
