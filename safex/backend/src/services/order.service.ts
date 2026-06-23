import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { lockFunds, unlockFunds } from './wallet.service.js';
import { getPrice } from './binance.service.js';

export async function placeOrder(userId: string, tradeId: string, margin: number) {
  const trade = await prisma.trade.findUniqueOrThrow({
    where: { id: tradeId },
    include: { pair: true },
  });
  if (trade.status !== 'OPEN') throw new Error('Trade is not open');

  await lockFunds(userId, margin, tradeId);
  return prisma.order.create({
    data: {
      userId,
      tradeId,
      margin,
      entryPrice: trade.entryPrice,
      status: 'ACTIVE',
    },
    include: { trade: { include: { pair: true } } },
  });
}

export async function myOrders(userId: string, openOnly = false) {
  return prisma.order.findMany({
    where: { userId, ...(openOnly ? { status: 'ACTIVE' } : {}) },
    include: { trade: { include: { pair: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

function calcPnl(
  type: 'LONG' | 'SHORT',
  margin: Prisma.Decimal,
  leverage: number,
  entry: Prisma.Decimal,
  close: Prisma.Decimal
) {
  const m = margin.toNumber();
  const e = entry.toNumber();
  const c = close.toNumber();
  const diff = type === 'LONG' ? (c - e) / e : (e - c) / e;
  return new Prisma.Decimal(m * leverage * diff);
}

export async function settleOrder(
  orderId: string,
  status: 'CLOSED_PROFIT' | 'CLOSED_LOSS' | 'CANCELLED',
  closePrice?: number
) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { trade: { include: { pair: true } } },
  });
  if (order.status !== 'ACTIVE') return order;

  const price = closePrice ?? Number(getPrice(order.trade.pair.symbol)?.price || order.entryPrice);
  const closeDec = new Prisma.Decimal(price);
  let pnl = new Prisma.Decimal(0);

  if (status === 'CLOSED_PROFIT' || status === 'CLOSED_LOSS') {
    pnl = calcPnl(order.trade.type, order.margin, order.trade.leverage, order.entryPrice, closeDec);
    if (status === 'CLOSED_LOSS' && pnl.greaterThan(0)) pnl = pnl.negated();
    if (status === 'CLOSED_PROFIT' && pnl.lessThan(0)) pnl = pnl.abs();
  }

  await unlockFunds(order.userId, order.margin, pnl, order.id);
  return prisma.order.update({
    where: { id: orderId },
    data: { status, closePrice: closeDec, pnl, closedAt: new Date() },
  });
}

export async function processActiveOrders() {
  const orders = await prisma.order.findMany({
    where: { status: 'ACTIVE' },
    include: { trade: { include: { pair: true } } },
  });

  for (const order of orders) {
    const tick = getPrice(order.trade.pair.symbol);
    if (!tick) continue;
    const current = Number(tick.price);
    const tp = order.trade.takeProfit.toNumber();
    const sl = order.trade.stopLoss.toNumber();
    const isLong = order.trade.type === 'LONG';

    if (isLong && current >= tp) await settleOrder(order.id, 'CLOSED_PROFIT', current);
    else if (!isLong && current <= tp) await settleOrder(order.id, 'CLOSED_PROFIT', current);
    else if (isLong && current <= sl) await settleOrder(order.id, 'CLOSED_LOSS', current);
    else if (!isLong && current >= sl) await settleOrder(order.id, 'CLOSED_LOSS', current);
  }
}
