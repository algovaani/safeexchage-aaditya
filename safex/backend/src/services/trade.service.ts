import { TradeStatus, TradeType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export async function createTrade(
  adminId: string,
  data: {
    pairId: string;
    type: TradeType;
    entryPrice: number;
    takeProfit: number;
    stopLoss: number;
    leverage: number;
  }
) {
  return prisma.trade.create({
    data: { ...data, status: 'OPEN', createdBy: adminId },
    include: { pair: true, _count: { select: { orders: true } } },
  });
}

export async function listTradesAdmin(status?: TradeStatus, pairId?: string) {
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (pairId) where.pairId = pairId;
  return prisma.trade.findMany({
    where,
    include: {
      pair: true,
      _count: { select: { orders: true } },
      orders: {
        where: { status: 'ACTIVE' },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listOpenTrades() {
  return prisma.trade.findMany({
    where: { status: 'OPEN' },
    include: { pair: true, _count: { select: { orders: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateTrade(
  id: string,
  data: Partial<{
    entryPrice: number;
    takeProfit: number;
    stopLoss: number;
    leverage: number;
    status: TradeStatus;
  }>
) {
  return prisma.trade.update({ where: { id }, data, include: { pair: true } });
}

export async function cancelTrade(id: string) {
  return prisma.$transaction([
    prisma.trade.update({ where: { id }, data: { status: 'CANCELLED' } }),
    prisma.order.updateMany({
      where: { tradeId: id, status: 'ACTIVE' },
      data: { status: 'CANCELLED', closedAt: new Date() },
    }),
  ]);
}
