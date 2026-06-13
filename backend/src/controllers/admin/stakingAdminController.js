import mongoose from 'mongoose';
import { StakingPlan } from '../../models/StakingPlan.js';
import { UserStake } from '../../models/UserStake.js';
import { error, success } from '../../utils/response.js';
import { roundMoney } from '../../utils/money.js';
import { daysBetween, planLabel, startOfDay } from '../../utils/stakingMath.js';

async function planStats(planId) {
  const rows = await UserStake.aggregate([
    { $match: { planId: new mongoose.Types.ObjectId(planId) } },
    {
      $group: {
        _id: null,
        total_stakes_count: { $sum: 1 },
        total_amount_staked: { $sum: '$amount' },
        active_stakes_count: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
      },
    },
  ]);

  return (
    rows[0] || {
      total_stakes_count: 0,
      total_amount_staked: 0,
      active_stakes_count: 0,
    }
  );
}

function formatAdminPlan(plan, stats) {
  return {
    id: plan._id,
    name: plan.name,
    apy_percent: roundMoney(plan.apyPercent),
    lock_days: plan.lockDays,
    min_amount: roundMoney(plan.minAmount),
    max_amount: roundMoney(plan.maxAmount),
    is_active: plan.isActive,
    label: planLabel(plan.apyPercent, plan.lockDays),
    total_stakes_count: stats.total_stakes_count,
    total_amount_staked: roundMoney(stats.total_amount_staked),
    active_stakes_count: stats.active_stakes_count,
    created_at: plan.createdAt,
  };
}

export async function createPlan(req, res, next) {
  try {
    const { name, apy_percent, lock_days, min_amount, max_amount } = req.body;

    const plan = await StakingPlan.create({
      name,
      apyPercent: apy_percent,
      lockDays: lock_days,
      minAmount: min_amount,
      maxAmount: max_amount,
      isActive: true,
    });

    return success(res, {
        id: plan._id,
        name: plan.name,
        apy_percent: roundMoney(plan.apyPercent),
        lock_days: plan.lockDays,
        min_amount: roundMoney(plan.minAmount),
        max_amount: roundMoney(plan.maxAmount),
        is_active: plan.isActive,
      }, 'Staking plan created', 201);
  } catch (e) {
    return next(e);
  }
}

export async function getAllPlans(_req, res, next) {
  try {
    const plans = await StakingPlan.find().sort({ lockDays: 1 }).lean();
    const data = await Promise.all(
      plans.map(async (plan) => {
        const stats = await planStats(plan._id);
        return formatAdminPlan(plan, stats);
      })
    );
    return success(res, data, 'Staking plans fetched');
  } catch (e) {
    return next(e);
  }
}

export async function updatePlan(req, res, next) {
  try {
    const plan = await StakingPlan.findById(req.params.id);
    if (!plan) {
      return error(res, 'Plan not found', 404);
    }

    const { name, apy_percent, min_amount, max_amount, is_active } = req.body;

    if (name != null) plan.name = name;
    if (apy_percent != null) plan.apyPercent = apy_percent;
    if (min_amount != null) plan.minAmount = min_amount;
    if (max_amount != null) plan.maxAmount = max_amount;
    if (is_active != null) plan.isActive = is_active;

    if (plan.maxAmount <= plan.minAmount) {
      return error(res, 'max_amount must be greater than min_amount', 400);
    }

    await plan.save();
    const stats = await planStats(plan._id);

    return success(res, formatAdminPlan(plan.toObject(), stats), 'Plan updated');
  } catch (e) {
    return next(e);
  }
}

export async function getAllStakes(req, res, next) {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    const [stakes, total] = await Promise.all([
      UserStake.find(filter)
        .populate('userId', 'email mobile')
        .populate('planId', 'name apyPercent lockDays')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserStake.countDocuments(filter),
    ]);

    const today = startOfDay();
    const items = stakes.map((s) => {
      const daysRemaining = Math.max(0, daysBetween(today, s.maturityDate));
      return {
        id: s._id,
        user_email: s.userId?.email || s.userId?.mobile || null,
        plan_name: s.planId?.name || null,
        amount: roundMoney(s.amount),
        reward_earned: roundMoney(s.rewardEarned),
        status: s.status,
        start_date: s.startDate,
        maturity_date: s.maturityDate,
        days_remaining: daysRemaining,
      };
    });

    return success(res, {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    }, 'Stakes fetched');
  } catch (e) {
    return next(e);
  }
}
