import mongoose from 'mongoose';
import { AdminTrade } from '../models/AdminTrade.js';
import { UserOrder } from '../models/UserOrder.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { roundMoney, storeMoney } from '../utils/money.js';

/**
 * PnL with loss capped at -margin (user cannot lose more than margin).
 */
export function calculatePnL(entryPrice, closePrice, margin, leverage) {
  const m = Number(margin);
  const lev = Number(leverage);
  const entry = Number(entryPrice);
  const close = Number(closePrice);

  let pnl = ((close - entry) / entry) * m * lev;
  if (pnl < -m) pnl = -m;

  const pnlRounded = storeMoney(pnl);
  const pnlPercent = m > 0 ? storeMoney((pnlRounded / m) * 100) : 0;

  return {
    pnl: roundMoney(pnlRounded),
    pnl_percent: roundMoney(pnlPercent),
    is_profit: pnlRounded > 0,
    pnl_raw: pnlRounded,
  };
}

/** @deprecated alias */
export function calculatePnl(marginAmount, leverage, entryPrice, closePrice) {
  return calculatePnL(entryPrice, closePrice, marginAmount, leverage).pnl_raw;
}

export function estimateOrderPnl(order, trade, markPrice) {
  const price = markPrice ?? trade.entryPrice;
  return calculatePnL(order.entryPrice, price, order.marginAmount, trade.leverage).pnl_raw;
}

async function logTransaction(session, payload) {
  await Transaction.create([payload], { session });
}

/**
 * Settle a single open user order at closePrice.
 */
export async function settleOrder(orderId, closePrice, { session: externalSession } = {}) {
  const ownsSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());
  if (ownsSession) session.startTransaction();

  try {
    const order = await UserOrder.findById(orderId).session(session);
    if (!order) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }
    if (order.status !== 'open') {
      throw Object.assign(new Error('Order is not open'), { status: 400 });
    }

    const trade = await AdminTrade.findById(order.tradeId).session(session);
    if (!trade) {
      throw Object.assign(new Error('Related trade not found'), { status: 404 });
    }

    const { pnl_raw: pnl, pnl: pnlDisplay, pnl_percent, is_profit } = calculatePnL(
      order.entryPrice,
      closePrice,
      order.marginAmount,
      trade.leverage
    );

    const margin = storeMoney(order.marginAmount);
    const returnAmount = storeMoney(Math.max(0, margin + pnl));

    const wallet = await Wallet.findOne({ userId: order.userId }).session(session);
    if (!wallet) {
      throw Object.assign(new Error('Wallet not found'), { status: 400 });
    }
    if (wallet.lockedBalance < margin) {
      throw Object.assign(new Error('Insufficient locked margin'), { status: 400 });
    }

    wallet.lockedBalance = storeMoney(wallet.lockedBalance - margin);
    wallet.balance = storeMoney(wallet.balance + returnAmount);
    await wallet.save({ session });

    order.status = 'closed';
    order.pnl = pnl;
    order.closePrice = storeMoney(closePrice);
    order.closedAt = new Date();
    await order.save({ session });

    if (is_profit && pnl > 0) {
      await logTransaction(session, {
        userId: order.userId,
        type: 'trade_profit',
        amount: roundMoney(pnl),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        orderId: order._id,
        tradeId: trade._id,
        reference: `trade_profit:${order._id}`,
      });
    } else if (pnl < 0) {
      await logTransaction(session, {
        userId: order.userId,
        type: 'trade_loss',
        amount: roundMoney(-Math.abs(pnl)),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        orderId: order._id,
        tradeId: trade._id,
        reference: `trade_loss:${order._id}`,
      });
    }

    if (ownsSession) await session.commitTransaction();

    return {
      orderId: order._id,
      tradeId: trade._id,
      closePrice: roundMoney(closePrice),
      margin: roundMoney(margin),
      returnAmount: roundMoney(returnAmount),
      pnl: pnlDisplay,
      pnl_percent,
      is_profit,
      balanceAfter: roundMoney(wallet.balance),
    };
  } catch (err) {
    if (ownsSession) await session.abortTransaction();
    throw err;
  } finally {
    if (ownsSession) session.endSession();
  }
}

/**
 * Settle all open orders on an admin trade, then close the trade.
 */
export async function settleAllOrdersForTrade(tradeId, closePrice) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const trade = await AdminTrade.findById(tradeId).session(session);
    if (!trade) {
      throw Object.assign(new Error('Trade not found'), { status: 404 });
    }
    if (trade.status !== 'open') {
      throw Object.assign(new Error('Only open trades can be settled'), { status: 400 });
    }

    const orders = await UserOrder.find({ tradeId, status: 'open' }).session(session);
    const settled = [];
    let totalPnl = 0;

    for (const order of orders) {
      const result = await settleOrder(order._id, closePrice, { session });
      settled.push(result);
      totalPnl += result.pnl;
    }

    trade.status = 'closed';
    trade.closePrice = storeMoney(closePrice);
    trade.closedAt = new Date();
    await trade.save({ session });

    await session.commitTransaction();

    return {
      tradeId: trade._id,
      settled_count: settled.length,
      total_pnl_distributed: roundMoney(totalPnl),
      orders: settled,
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Cancel single order — return margin, no PnL.
 */
export async function cancelOrder(orderId, { session: externalSession } = {}) {
  const ownsSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());
  if (ownsSession) session.startTransaction();

  try {
    const order = await UserOrder.findById(orderId).session(session);
    if (!order) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }
    if (order.status !== 'open') {
      throw Object.assign(new Error('Order is not open'), { status: 400 });
    }

    const margin = storeMoney(order.marginAmount);
    const wallet = await Wallet.findOne({ userId: order.userId }).session(session);
    if (!wallet) {
      throw Object.assign(new Error('Wallet not found'), { status: 400 });
    }
    if (wallet.lockedBalance < margin) {
      throw Object.assign(new Error('Insufficient locked margin'), { status: 400 });
    }

    wallet.lockedBalance = storeMoney(wallet.lockedBalance - margin);
    wallet.balance = storeMoney(wallet.balance + margin);
    await wallet.save({ session });

    order.status = 'cancelled';
    order.pnl = 0;
    order.closedAt = new Date();
    await order.save({ session });

    await logTransaction(session, {
      userId: order.userId,
      type: 'trade_margin_returned',
      amount: roundMoney(margin),
      balanceAfter: roundMoney(wallet.balance),
      currency: 'USDT',
      status: 'completed',
      orderId: order._id,
      tradeId: order.tradeId,
      reference: `trade_margin_returned:${order._id}`,
    });

    if (ownsSession) await session.commitTransaction();

    return {
      orderId: order._id,
      marginReturned: roundMoney(margin),
      balanceAfter: roundMoney(wallet.balance),
    };
  } catch (err) {
    if (ownsSession) await session.abortTransaction();
    throw err;
  } finally {
    if (ownsSession) session.endSession();
  }
}

/**
 * Cancel entire admin trade — release all open order margins.
 */
export async function cancelTradeAndReleaseMargins(tradeId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const trade = await AdminTrade.findById(tradeId).session(session);
    if (!trade) {
      throw Object.assign(new Error('Trade not found'), { status: 404 });
    }
    if (trade.status !== 'open') {
      throw Object.assign(new Error('Only open trades can be cancelled'), { status: 400 });
    }

    const orders = await UserOrder.find({ tradeId, status: 'open' }).session(session);
    const results = [];

    for (const order of orders) {
      const r = await cancelOrder(order._id, { session });
      results.push(r);
    }

    trade.status = 'cancelled';
    trade.closedAt = new Date();
    await trade.save({ session });

    await session.commitTransaction();
    return { trade, cancelledOrders: results.length, orders: results };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
