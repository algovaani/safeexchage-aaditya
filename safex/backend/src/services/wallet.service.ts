import { Prisma, TxType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type WalletOp = {
  userId: string;
  amount: Prisma.Decimal | number | string;
  type: TxType;
  reason?: string;
  referenceId?: string;
};

async function logTx(
  tx: Prisma.TransactionClient,
  userId: string,
  type: TxType,
  amount: Prisma.Decimal,
  before: Prisma.Decimal,
  after: Prisma.Decimal,
  reason?: string,
  referenceId?: string
) {
  await tx.walletTransaction.create({
    data: { userId, type, amount, balanceBefore: before, balanceAfter: after, reason, referenceId },
  });
}

export async function getBalance(userId: string) {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  const balance = w?.balance ?? new Prisma.Decimal(0);
  const locked = w?.lockedBalance ?? new Prisma.Decimal(0);
  return {
    balance,
    lockedBalance: locked,
    total: balance.plus(locked),
  };
}

export async function creditWallet({ userId, amount, type, reason, referenceId }: WalletOp) {
  const amt = new Prisma.Decimal(amount);
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const before = wallet.balance;
    const after = before.plus(amt);
    await tx.wallet.update({ where: { userId }, data: { balance: after } });
    await logTx(tx, userId, type, amt, before, after, reason, referenceId);
    return after;
  });
}

export async function debitWallet({ userId, amount, type, reason, referenceId }: WalletOp) {
  const amt = new Prisma.Decimal(amount);
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (wallet.balance.lessThan(amt)) throw new Error('Insufficient balance');
    const before = wallet.balance;
    const after = before.minus(amt);
    await tx.wallet.update({ where: { userId }, data: { balance: after } });
    await logTx(tx, userId, type, amt.negated(), before, after, reason, referenceId);
    return after;
  });
}

export async function lockFunds(userId: string, amount: Prisma.Decimal | number | string, referenceId?: string) {
  const amt = new Prisma.Decimal(amount);
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (wallet.balance.lessThan(amt)) throw new Error('Insufficient balance');
    const before = wallet.balance;
    const after = before.minus(amt);
    await tx.wallet.update({
      where: { userId },
      data: { balance: after, lockedBalance: wallet.lockedBalance.plus(amt) },
    });
    await logTx(tx, userId, 'TRADE_LOCK', amt.negated(), before, after, 'Order margin lock', referenceId);
    return after;
  });
}

export async function unlockFunds(
  userId: string,
  amount: Prisma.Decimal | number | string,
  pnl: Prisma.Decimal | number | string = 0,
  referenceId?: string
) {
  const amt = new Prisma.Decimal(amount);
  const pnlDec = new Prisma.Decimal(pnl);
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const before = wallet.balance;
    const credit = amt.plus(pnlDec);
    const after = before.plus(credit);
    const newLocked = wallet.lockedBalance.minus(amt);
    await tx.wallet.update({
      where: { userId },
      data: { balance: after, lockedBalance: newLocked.lessThan(0) ? 0 : newLocked },
    });
    await logTx(tx, userId, 'TRADE_UNLOCK', credit, before, after, 'Order settle', referenceId);
    if (!pnlDec.isZero()) {
      await logTx(tx, userId, 'TRADE_PNL', pnlDec, before, after, 'Trade PnL', referenceId);
    }
    return after;
  });
}
