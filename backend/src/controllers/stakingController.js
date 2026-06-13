import mongoose from 'mongoose';
import { StakingPlan } from '../models/StakingPlan.js';
import { UserStake } from '../models/UserStake.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { KycSubmission } from '../models/KycSubmission.js';
import { error, success } from '../utils/response.js';
import { roundMoney, storeMoney } from '../utils/money.js';
import {
  addDays,
  calculateEarnedSoFar,
  calculateMaturityReward,
  daysBetween,
  planLabel,
  startOfDay,
} from '../utils/stakingMath.js';

function formatPlan(plan) {
  return {
    id: plan._id,
    name: plan.name,
    apy_percent: roundMoney(plan.apyPercent),
    lock_days: plan.lockDays,
    min_amount: roundMoney(plan.minAmount),
    max_amount: roundMoney(plan.maxAmount),
    label: planLabel(plan.apyPercent, plan.lockDays),
  };
}

function formatStakeRow(stake, plan) {
  const today = startOfDay();
  const daysElapsed = daysBetween(stake.startDate, today);
  const daysRemaining = Math.max(0, daysBetween(today, stake.maturityDate));
  const isMatured = today >= startOfDay(stake.maturityDate);
  const earnedSoFar = calculateEarnedSoFar(stake.amount, stake.apyPercent, daysElapsed);
  const totalRewardAtMaturity = calculateMaturityReward(
    stake.amount,
    stake.apyPercent,
    stake.lockDays
  );

  return {
    id: stake._id,
    plan_name: plan?.name || null,
    apy_percent: roundMoney(stake.apyPercent),
    lock_days: stake.lockDays,
    amount: roundMoney(stake.amount),
    start_date: stake.startDate,
    maturity_date: stake.maturityDate,
    status: stake.status,
    reward_earned: roundMoney(stake.rewardEarned),
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    earned_so_far: roundMoney(earnedSoFar),
    total_reward_at_maturity: roundMoney(totalRewardAtMaturity),
    is_matured: isMatured,
  };
}

export async function getPlans(_req, res, next) {
  try {
    const plans = await StakingPlan.find({ isActive: true }).sort({ lockDays: 1 }).lean();
    return success(res, plans.map(formatPlan), 'Staking plans fetched');
  } catch (e) {
    return next(e);
  }
}

export async function createStake(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { plan_id, amount } = req.body;
    const stakeAmount = storeMoney(amount);

    const kyc = await KycSubmission.findOne({ userId: req.userId, status: 'approved' }).session(
      session
    );
    if (!kyc) {
      await session.abortTransaction();
      return error(res, 'Approved KYC is required to stake', 403);
    }

    const plan = await StakingPlan.findOne({ _id: plan_id, isActive: true }).session(session);
    if (!plan) {
      await session.abortTransaction();
      return error(res, 'Staking plan not found or inactive', 400);
    }

    if (stakeAmount < plan.minAmount || stakeAmount > plan.maxAmount) {
      await session.abortTransaction();
      return error(
        res,
        `Amount must be between ${roundMoney(plan.minAmount)} and ${roundMoney(plan.maxAmount)} USDT`,
        400
      );
    }

    const wallet = await Wallet.findOne({ userId: req.userId }).session(session);
    if (!wallet || wallet.balance < stakeAmount) {
      await session.abortTransaction();
      return error(res, 'Insufficient USDT balance', 400);
    }

    const startDate = startOfDay();
    const maturityDate = addDays(startDate, plan.lockDays);

    wallet.balance = storeMoney(wallet.balance - stakeAmount);
    wallet.lockedBalance = storeMoney((wallet.lockedBalance || 0) + stakeAmount);
    await wallet.save({ session });

    const [stake] = await UserStake.create(
      [
        {
          userId: req.userId,
          planId: plan._id,
          amount: stakeAmount,
          apyPercent: plan.apyPercent,
          lockDays: plan.lockDays,
          startDate,
          maturityDate,
          status: 'active',
          rewardEarned: 0,
        },
      ],
      { session }
    );

    await Transaction.create(
      [
        {
          userId: req.userId,
          type: 'stake_locked',
          amount: roundMoney(-stakeAmount),
          balanceAfter: roundMoney(wallet.balance),
          currency: 'USDT',
          status: 'completed',
          reference: `stake_locked:${stake._id}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return success(res, formatStakeRow(stake.toObject(), plan.toObject()), 'Stake created successfully', 201);
  } catch (e) {
    await session.abortTransaction();
    return next(e);
  } finally {
    session.endSession();
  }
}

export async function getPortfolio(req, res, next) {
  try {
    const stakes = await UserStake.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    const planIds = [...new Set(stakes.map((s) => String(s.planId)))];
    const plans = await StakingPlan.find({ _id: { $in: planIds } }).lean();
    const planMap = new Map(plans.map((p) => [String(p._id), p]));

    const portfolio = stakes.map((s) => formatStakeRow(s, planMap.get(String(s.planId))));
    return success(res, portfolio, 'Staking portfolio fetched');
  } catch (e) {
    return next(e);
  }
}

export async function withdrawStake(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const stake = await UserStake.findById(req.params.stakeId).session(session);
    if (!stake || String(stake.userId) !== req.userId) {
      await session.abortTransaction();
      return error(res, 'Stake not found', 404);
    }

    if (!['active', 'matured'].includes(stake.status)) {
      await session.abortTransaction();
      return error(res, 'Stake is not eligible for withdrawal', 400);
    }

    const today = startOfDay();
    const isMatured = today >= startOfDay(stake.maturityDate);

    const wallet = await Wallet.findOne({ userId: req.userId }).session(session);
    if (!wallet || wallet.lockedBalance < stake.amount) {
      await session.abortTransaction();
      return error(res, 'Insufficient locked balance for this stake', 400);
    }

    let returnAmount;
    let rewardEarned = 0;
    let withdrawalType;

    if (isMatured) {
      rewardEarned = calculateMaturityReward(stake.amount, stake.apyPercent, stake.lockDays);
      returnAmount = storeMoney(stake.amount + rewardEarned);
      withdrawalType = 'matured';

      wallet.lockedBalance = storeMoney(wallet.lockedBalance - stake.amount);
      wallet.balance = storeMoney(wallet.balance + returnAmount);

      stake.status = 'matured';
      stake.rewardEarned = rewardEarned;

      await wallet.save({ session });
      await stake.save({ session });

      await Transaction.create(
        [
          {
            userId: req.userId,
            type: 'stake_principal_returned',
            amount: roundMoney(stake.amount),
            balanceAfter: roundMoney(wallet.balance),
            currency: 'USDT',
            status: 'completed',
            reference: `stake_principal:${stake._id}`,
          },
          {
            userId: req.userId,
            type: 'stake_reward',
            amount: roundMoney(rewardEarned),
            balanceAfter: roundMoney(wallet.balance),
            currency: 'USDT',
            status: 'completed',
            reference: `stake_reward:${stake._id}`,
          },
        ],
        { session }
      );
    } else {
      returnAmount = storeMoney(stake.amount);
      withdrawalType = 'early';

      wallet.lockedBalance = storeMoney(wallet.lockedBalance - stake.amount);
      wallet.balance = storeMoney(wallet.balance + stake.amount);

      stake.status = 'withdrawn';
      stake.rewardEarned = 0;

      await wallet.save({ session });
      await stake.save({ session });

      await Transaction.create(
        [
          {
            userId: req.userId,
            type: 'stake_early_withdrawal',
            amount: roundMoney(stake.amount),
            balanceAfter: roundMoney(wallet.balance),
            currency: 'USDT',
            status: 'completed',
            reference: `stake_early:${stake._id}`,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();

    return success(res, {
      return_amount: roundMoney(returnAmount),
      reward_earned: roundMoney(rewardEarned),
      withdrawal_type: withdrawalType,
      balance: roundMoney(wallet.balance),
      locked_balance: roundMoney(wallet.lockedBalance),
    }, 'Stake withdrawn successfully');
  } catch (e) {
    await session.abortTransaction();
    return next(e);
  } finally {
    session.endSession();
  }
}
