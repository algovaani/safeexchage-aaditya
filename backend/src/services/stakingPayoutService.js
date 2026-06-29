import mongoose from 'mongoose';
import { UserStake } from '../models/UserStake.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { StakingPlan } from '../models/StakingPlan.js';
import { roundMoney, storeMoney } from '../utils/money.js';
import {
  calculateDailyReward,
  calculateMaturityReward,
  calculateMaturityAmount,
  startOfDay,
} from '../utils/stakingMath.js';

export async function creditDailyReward(stake, plan, session) {
  const daily = calculateDailyReward(stake.amount, stake.apyPercent, stake.lockDays);
  if (!(daily > 0)) return 0;

  const wallet = await Wallet.findOne({ userId: stake.userId }).session(session);
  if (!wallet) throw new Error('Wallet not found');

  wallet.balance = storeMoney(wallet.balance + daily);
  stake.rewardEarned = storeMoney((stake.rewardEarned || 0) + daily);
  stake.lastDailyPayoutAt = startOfDay();

  await wallet.save({ session });
  await stake.save({ session });

  await Transaction.create(
    [
      {
        userId: stake.userId,
        type: 'stake_reward',
        amount: roundMoney(daily),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        reference: `stake_daily:${stake._id}:${stake.lastDailyPayoutAt.toISOString().slice(0, 10)}`,
      },
    ],
    { session }
  );

  return daily;
}

export async function releaseMaturityPayout(stake, { session, markWithdrawn = true } = {}) {
  if (!['active', 'matured'].includes(stake.status)) {
    throw Object.assign(new Error('Stake is not eligible for payout'), { status: 400 });
  }
  if (stake.payoutReleased) {
    throw Object.assign(new Error('Payout already released'), { status: 400 });
  }

  const plan = await StakingPlan.findById(stake.planId).session(session);
  const payoutType = plan?.payoutType || 'end_of_plan';

  const wallet = await Wallet.findOne({ userId: stake.userId }).session(session);
  if (!wallet || wallet.lockedBalance < stake.amount) {
    throw Object.assign(new Error('Insufficient locked balance for this stake'), { status: 400 });
  }

  const totalReward = calculateMaturityReward(stake.amount, stake.apyPercent, stake.lockDays);
  const alreadyPaid = storeMoney(stake.rewardEarned || 0);
  const remainingReward =
    payoutType === 'daily' ? storeMoney(Math.max(0, totalReward - alreadyPaid)) : totalReward;

  const returnAmount = storeMoney(stake.amount + remainingReward);

  wallet.lockedBalance = storeMoney(wallet.lockedBalance - stake.amount);
  wallet.balance = storeMoney(wallet.balance + returnAmount);

  stake.rewardEarned = storeMoney(alreadyPaid + remainingReward);
  stake.payoutReleased = true;
  if (markWithdrawn) {
    stake.status = 'withdrawn';
  } else if (stake.status === 'active') {
    stake.status = 'matured';
  }

  await wallet.save({ session });
  await stake.save({ session });

  const txns = [
    {
      userId: stake.userId,
      type: 'stake_principal_returned',
      amount: roundMoney(stake.amount),
      balanceAfter: roundMoney(wallet.balance),
      currency: 'USDT',
      status: 'completed',
      reference: `stake_principal:${stake._id}`,
    },
  ];

  if (remainingReward > 0) {
    txns.push({
      userId: stake.userId,
      type: 'stake_reward',
      amount: roundMoney(remainingReward),
      balanceAfter: roundMoney(wallet.balance),
      currency: 'USDT',
      status: 'completed',
      reference: `stake_reward:${stake._id}`,
    });
  }

  await Transaction.create(txns, { session });

  return {
    return_amount: roundMoney(returnAmount),
    reward_earned: roundMoney(remainingReward),
    maturity_amount: roundMoney(calculateMaturityAmount(stake.amount, stake.apyPercent, stake.lockDays)),
    balance: roundMoney(wallet.balance),
    locked_balance: roundMoney(wallet.lockedBalance),
  };
}

export async function refundRejectedStake(stake, session) {
  const wallet = await Wallet.findOne({ userId: stake.userId }).session(session);
  if (!wallet) throw new Error('Wallet not found');

  wallet.balance = storeMoney(wallet.balance + stake.amount);
  wallet.lockedBalance = storeMoney(Math.max(0, (wallet.lockedBalance || 0) - stake.amount));
  stake.status = 'rejected';

  await wallet.save({ session });
  await stake.save({ session });

  await Transaction.create(
    [
      {
        userId: stake.userId,
        type: 'stake_early_withdrawal',
        amount: roundMoney(stake.amount),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        reference: `stake_rejected:${stake._id}`,
      },
    ],
    { session }
  );
}

export async function runWithTransaction(fn) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
