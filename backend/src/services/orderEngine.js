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
import { unitPriceToUsdt } from '../utils/inrTrading.js';
import { applyBonusClamp } from './walletAdjustmentService.js';

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

async function ensureLiquidityUserId() {
  const liqEmail = process.env.SYSTEM_LIQUIDITY_EMAIL || 'liquidity@internal.safex';
  let user = await User.findOne({ email: liqEmail }).select('_id').lean();
  if (user?._id) return user._id;

  user = await User.findOne({ role: 'system' }).select('_id').lean();
  if (user?._id) return user._id;

  const bcrypt = (await import('bcryptjs')).default;
  const passwordHash = await bcrypt.hash(
    process.env.SYSTEM_LIQUIDITY_PASSWORD || 'LiquidityInternal123!',
    12
  );
  const created = await User.create({
    email: liqEmail,
    passwordHash,
    name: 'Liquidity',
    role: 'system',
  });
  await Wallet.create({ userId: created._id, currency: 'USDT', balance: 0, lockedBalance: 0 });
  return created._id;
}

async function getLiquidityUserId() {
  if (!liquidityUserIdPromise) {
    liquidityUserIdPromise = ensureLiquidityUserId().catch((err) => {
      liquidityUserIdPromise = null;
      throw err;
    });
  }
  return liquidityUserIdPromise;
}

/**
 * @param {string} symbol
 * @param {number} currentPrice - mark / pulse price used to fill
 * @param {{ fromPrice?: number|null, rangeOnly?: boolean }} [opts]
 *   With fromPrice (admin pulse): classic wick cross — buy if path low ≤ limit, sell if path high ≥ limit.
 *   Market orders always try to fill at currentPrice.
 */
export async function processOrdersForPrice(symbol, currentPrice, opts = {}) {
  return withSymbolOrderLock(symbol, () => processOrdersForPriceUnlocked(symbol, currentPrice, opts));
}

async function processOrdersForPriceUnlocked(symbol, currentPrice, opts = {}) {
  const sym = symbol.toUpperCase();
  const fillPriceUsdt = await unitPriceToUsdt(sym, currentPrice);
  if (!(fillPriceUsdt > 0)) return [];

  const fromRaw = opts.fromPrice != null ? Number(opts.fromPrice) : null;
  const fromUsdt =
    fromRaw != null && Number.isFinite(fromRaw) && fromRaw > 0
      ? await unitPriceToUsdt(sym, fromRaw)
      : null;
  const wickMode = Boolean(opts.rangeOnly && fromUsdt != null);
  const pathLo = fromUsdt != null ? Math.min(fromUsdt, fillPriceUsdt) : fillPriceUsdt;
  const pathHi = fromUsdt != null ? Math.max(fromUsdt, fillPriceUsdt) : fillPriceUsdt;
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
    const fillPrice = fillPriceUsdt;

    if (fresh.orderType === 'market') {
      // Instant fill at pulse/mark — including during admin pulse
      shouldFill = true;
    } else if (fresh.orderType === 'limit' && fresh.price != null) {
      const limitUsdt = await unitPriceToUsdt(sym, fresh.price);
      if (!(limitUsdt > 0)) continue;
      if (wickMode) {
        // Candle/wick match: path traded through the limit
        if (fresh.side === 'buy') shouldFill = pathLo <= limitUsdt + 1e-10;
        if (fresh.side === 'sell') shouldFill = pathHi >= limitUsdt - 1e-10;
      } else {
        if (fresh.side === 'buy' && fillPriceUsdt <= limitUsdt + 1e-10) shouldFill = true;
        if (fresh.side === 'sell' && fillPriceUsdt >= limitUsdt - 1e-10) shouldFill = true;
      }
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
  const payload = {
    type: side === 'buy' ? 'spot_buy' : 'spot_sell',
    amount: roundMoney(amount),
    balanceAfter: roundMoney(wallet?.balance || 0),
    currency: 'USDT',
    status: 'completed',
    method: 'gateway',
    reference: `${symbol} ${side} ${quantity} @ ${roundMoney(price)}`,
    spotTradeId: tradeId,
    adminNote: `${symbol} ${side.toUpperCase()} ${quantity} @ ${roundMoney(price)} USDT`,
  };

  const pending = await Transaction.findOne({ userId, spotOrderId: orderId, status: 'pending' });
  if (pending) {
    await Transaction.findByIdAndUpdate(pending._id, payload);
    return;
  }

  await Transaction.create({
    userId,
    ...payload,
    spotOrderId: orderId,
  });
}

async function markSpotOrderTransaction(userId, orderId, status, note = '') {
  await Transaction.findOneAndUpdate(
    { userId, spotOrderId: orderId, status: 'pending' },
    { status, adminNote: note || undefined }
  );
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
    await markSpotOrderTransaction(userId, orderId, 'rejected', 'Insufficient USDT balance');
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
        await markSpotOrderTransaction(userId, orderId, 'rejected', 'Insufficient USDT balance');
        return null;
      }
      wallet.balance = storeMoney(wallet.balance - cost);
      applyBonusClamp(wallet);
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
    await markSpotOrderTransaction(userId, orderId, 'rejected', err.message || 'Order rejected');
    return null;
  }

  const buyOrderId = orderId;
  const sellOrderId = orderId;
  const counterpartyId = liquidityId || (await getLiquidityUserId());
  const buyerUserId = order.side === 'buy' ? userId : counterpartyId;
  const sellerUserId = order.side === 'sell' ? userId : counterpartyId;

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
