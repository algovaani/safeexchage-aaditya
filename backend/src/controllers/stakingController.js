import mongoose from 'mongoose';
import { StakingPlan } from '../models/StakingPlan.js';
import { UserStake } from '../models/UserStake.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { error, success } from '../utils/response.js';
import { roundMoney, storeMoney } from '../utils/money.js';
import {
  addDays,
  calculateEarnedSoFar,
  calculateMaturityAmount,
  calculateMaturityReward,
  daysBetween,
  planLabel,
  startOfDay,
} from '../utils/stakingMath.js';
import { releaseMaturityPayout, runWithTransaction } from '../services/stakingPayoutService.js';

function formatPlan(plan) {
  return {
    id: plan._id,
    name: plan.name,
    roi_percent: roundMoney(plan.apyPercent),
    apy_percent: roundMoney(plan.apyPercent),
    lock_days: plan.lockDays,
    min_amount: roundMoney(plan.minAmount),
    max_amount: roundMoney(plan.maxAmount),
    payout_type: plan.payoutType || 'end_of_plan',
    payout_mode: plan.payoutMode || 'auto',
    requires_approval: Boolean(plan.requiresApproval),
    currency: 'USDT',
    label: planLabel(plan.apyPercent, plan.lockDays),
  };
}

function formatStakeRow(stake, plan) {
  const today = startOfDay();
  const isPending = stake.status === 'pending';
  const isRejected = stake.status === 'rejected';
  const daysElapsed = isPending || isRejected ? 0 : daysBetween(stake.startDate, today);
  const daysRemaining =
    isPending || isRejected ? stake.lockDays : Math.max(0, daysBetween(today, stake.maturityDate));
  const isMatured =
    !isPending && !isRejected && stake.startDate && today >= startOfDay(stake.maturityDate);
  const earnedSoFar = calculateEarnedSoFar(
    stake.amount,
    stake.apyPercent,
    stake.lockDays,
    daysElapsed
  );
  const totalRewardAtMaturity = calculateMaturityReward(
    stake.amount,
    stake.apyPercent,
    stake.lockDays
  );
  const maturityAmount = calculateMaturityAmount(stake.amount, stake.apyPercent, stake.lockDays);
  const payoutType = plan?.payoutType || 'end_of_plan';
  const payoutMode = plan?.payoutMode || 'auto';
  const canClaim =
    ['active', 'matured'].includes(stake.status) &&
    isMatured &&
    !stake.payoutReleased &&
    payoutMode !== 'manual';
  const awaitingAdminRelease =
    isMatured && payoutMode === 'manual' && !stake.payoutReleased && stake.status !== 'withdrawn';

  return {
    id: stake._id,
    plan_id: stake.planId,
    plan_name: plan?.name || null,
    roi_percent: roundMoney(stake.apyPercent),
    apy_percent: roundMoney(stake.apyPercent),
    lock_days: stake.lockDays,
    amount: roundMoney(stake.amount),
    currency: 'USDT',
    start_date: isPending ? null : stake.startDate,
    end_date: isPending ? null : stake.maturityDate,
    maturity_date: isPending ? null : stake.maturityDate,
    status: stake.status,
    reward_earned: roundMoney(stake.rewardEarned),
    profit: roundMoney(stake.rewardEarned),
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    earned_so_far: roundMoney(earnedSoFar),
    total_reward_at_maturity: roundMoney(totalRewardAtMaturity),
    maturity_amount: roundMoney(maturityAmount),
    payout_type: payoutType,
    payout_mode: payoutMode,
    payout_released: Boolean(stake.payoutReleased),
    is_matured: isMatured,
    can_claim: canClaim,
    can_early_withdraw: stake.status === 'active' && !isMatured,
    awaiting_admin_release: awaitingAdminRelease,
    admin_note: stake.adminNote || '',
  };
}

export async function getPlans(_req, res, next) {
  try {
    const plans = await StakingPlan.find({ isActive: true }).sort({ lockDays: 1 }).lean();
    return success(res, plans.map(formatPlan), 'Investment plans fetched');
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

    const plan = await StakingPlan.findOne({ _id: plan_id, isActive: true }).session(session);
    if (!plan) {
      await session.abortTransaction();
      return error(res, 'Investment plan not found or inactive', 400);
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

    const needsApproval = Boolean(plan.requiresApproval);
    const startDate = needsApproval ? null : startOfDay();
    const maturityDate = needsApproval ? null : addDays(startDate, plan.lockDays);

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
          startDate: startDate || new Date(0),
          maturityDate: maturityDate || new Date(0),
          status: needsApproval ? 'pending' : 'active',
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

    return success(
      res,
      formatStakeRow(stake.toObject(), plan.toObject()),
      needsApproval ? 'Investment submitted for admin approval' : 'Investment created successfully',
      201
    );
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
    return success(res, portfolio, 'Investment portfolio fetched');
  } catch (e) {
    return next(e);
  }
}

export async function withdrawStake(req, res, next) {
  try {
    const stake = await UserStake.findById(req.params.stakeId);
    if (!stake || String(stake.userId) !== req.userId) {
      return error(res, 'Investment not found', 404);
    }

    if (stake.status === 'pending') {
      return error(res, 'Investment is awaiting admin approval', 400);
    }
    if (stake.status === 'rejected') {
      return error(res, 'Investment was rejected', 400);
    }
    if (stake.payoutReleased || stake.status === 'withdrawn') {
      return error(res, 'Investment already completed', 400);
    }

    const plan = await StakingPlan.findById(stake.planId).lean();
    const today = startOfDay();
    const isMatured = stake.startDate && today >= startOfDay(stake.maturityDate);

    if (isMatured) {
      if (plan?.payoutMode === 'manual' && !stake.payoutReleased) {
        return error(res, 'Maturity payout will be released by admin', 400);
      }

      const result = await runWithTransaction(async (session) => {
        const row = await UserStake.findById(stake._id).session(session);
        return releaseMaturityPayout(row, { session, markWithdrawn: true });
      });

      return success(res, { ...result, withdrawal_type: 'matured' }, 'Maturity payout claimed');
    }

    if (stake.status !== 'active') {
      return error(res, 'Investment is not eligible for withdrawal', 400);
    }

    const result = await runWithTransaction(async (session) => {
      const row = await UserStake.findById(stake._id).session(session);
      const wallet = await Wallet.findOne({ userId: req.userId }).session(session);
      if (!wallet || wallet.lockedBalance < row.amount) {
        throw Object.assign(new Error('Insufficient locked balance'), { status: 400 });
      }

      wallet.lockedBalance = storeMoney(wallet.lockedBalance - row.amount);
      wallet.balance = storeMoney(wallet.balance + row.amount);
      row.status = 'withdrawn';
      row.rewardEarned = 0;

      await wallet.save({ session });
      await row.save({ session });

      await Transaction.create(
        [
          {
            userId: req.userId,
            type: 'stake_early_withdrawal',
            amount: roundMoney(row.amount),
            balanceAfter: roundMoney(wallet.balance),
            currency: 'USDT',
            status: 'completed',
            reference: `stake_early:${row._id}`,
          },
        ],
        { session }
      );

      return {
        return_amount: roundMoney(row.amount),
        reward_earned: 0,
        withdrawal_type: 'early',
        balance: roundMoney(wallet.balance),
        locked_balance: roundMoney(wallet.lockedBalance),
      };
    });

    return success(res, result, 'Early withdrawal completed (no reward)');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}
