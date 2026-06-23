import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { creditWallet, debitWallet } from './wallet.service.js';

export async function listPlans() {
  return prisma.stakingPlan.findMany({ where: { isActive: true }, orderBy: { apy: 'asc' } });
}

export async function createStake(userId: string, planId: string, amount: number) {
  const plan = await prisma.stakingPlan.findUniqueOrThrow({ where: { id: planId } });
  const amt = new Prisma.Decimal(amount);
  if (amt.lessThan(plan.minAmount) || amt.greaterThan(plan.maxAmount)) {
    throw new Error('Amount outside plan limits');
  }
  await debitWallet({ userId, amount: amt, type: 'STAKE', reason: `Stake ${plan.name}`, referenceId: planId });
  const maturity = new Date();
  maturity.setDate(maturity.getDate() + plan.lockDays);
  return prisma.stake.create({
    data: { userId, planId, amount: amt, maturityDate: maturity },
    include: { plan: true },
  });
}

export async function myStakes(userId: string) {
  return prisma.stake.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function withdrawStake(userId: string, stakeId: string, early = false) {
  const stake = await prisma.stake.findFirstOrThrow({
    where: { id: stakeId, userId },
    include: { plan: true },
  });
  if (stake.status !== 'MATURED' && !(early && stake.plan.allowEarlyExit)) {
    throw new Error('Stake cannot be withdrawn');
  }

  let reward = stake.reward;
  if (early && stake.plan.allowEarlyExit) {
    const penalty = reward.mul(stake.plan.earlyExitPenalty).div(100);
    reward = reward.minus(penalty);
  }

  const total = stake.amount.plus(reward);
  await creditWallet({
    userId,
    amount: total,
    type: 'STAKE_WITHDRAW',
    reason: early ? 'Early stake exit' : 'Stake withdrawal',
    referenceId: stakeId,
  });

  return prisma.stake.update({
    where: { id: stakeId },
    data: { status: early ? 'EARLY_EXIT' : 'WITHDRAWN', endDate: new Date(), reward },
  });
}

export async function processDailyStaking() {
  const stakes = await prisma.stake.findMany({
    where: { status: 'ACTIVE' },
    include: { plan: true },
  });
  const now = new Date();

  for (const stake of stakes) {
    const daily = stake.amount.mul(stake.plan.apy).div(100).div(365);
    const newReward = stake.reward.plus(daily);
    const matured = now >= stake.maturityDate;
    await prisma.stake.update({
      where: { id: stake.id },
      data: { reward: newReward, ...(matured ? { status: 'MATURED' } : {}) },
    });
  }
}

export async function createPlan(data: {
  name: string;
  apy: number;
  lockDays: number;
  minAmount: number;
  maxAmount: number;
  allowEarlyExit?: boolean;
  earlyExitPenalty?: number;
}) {
  return prisma.stakingPlan.create({ data });
}

export async function updatePlan(id: string, data: Partial<{ apy: number; isActive: boolean }>) {
  return prisma.stakingPlan.update({ where: { id }, data });
}

export async function allStakesAdmin(status?: string) {
  return prisma.stake.findMany({
    where: status && status !== 'ALL' ? { status: status as 'ACTIVE' } : {},
    include: { plan: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
