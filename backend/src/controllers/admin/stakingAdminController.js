import mongoose from 'mongoose';
import { StakingPlan } from '../../models/StakingPlan.js';
import { UserStake } from '../../models/UserStake.js';
import { error, success } from '../../utils/response.js';
import { roundMoney } from '../../utils/money.js';
import {
  addDays,
  calculateMaturityAmount,
  calculateMaturityReward,
  daysBetween,
  planLabel,
  startOfDay,
} from '../../utils/stakingMath.js';
import {
  refundRejectedStake,
  releaseMaturityPayout,
  runWithTransaction,
} from '../../services/stakingPayoutService.js';

async function planStats(planId) {
  const rows = await UserStake.aggregate([
    { $match: { planId: new mongoose.Types.ObjectId(planId) } },
    {
      $group: {
        _id: null,
        total_stakes_count: { $sum: 1 },
        total_amount_staked: { $sum: '$amount' },
        active_stakes_count: {
          $sum: { $cond: [{ $in: ['$status', ['active', 'pending']] }, 1, 0] },
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
    roi_percent: roundMoney(plan.apyPercent),
    apy_percent: roundMoney(plan.apyPercent),
    lock_days: plan.lockDays,
    min_amount: roundMoney(plan.minAmount),
    max_amount: roundMoney(plan.maxAmount),
    payout_type: plan.payoutType || 'end_of_plan',
    payout_mode: plan.payoutMode || 'auto',
    requires_approval: Boolean(plan.requiresApproval),
    is_active: plan.isActive,
    currency: 'USDT',
    label: planLabel(plan.apyPercent, plan.lockDays),
    total_stakes_count: stats.total_stakes_count,
    total_amount_staked: roundMoney(stats.total_amount_staked),
    active_stakes_count: stats.active_stakes_count,
    created_at: plan.createdAt,
  };
}

function formatAdminStake(s, plan) {
  const today = startOfDay();
  const daysRemaining =
    s.status === 'pending' ? s.lockDays : Math.max(0, daysBetween(today, s.maturityDate));
  const profit = calculateMaturityReward(s.amount, s.apyPercent, s.lockDays);
  const maturityAmount = calculateMaturityAmount(s.amount, s.apyPercent, s.lockDays);
  const isMatured =
    s.status !== 'pending' && s.startDate && today >= startOfDay(s.maturityDate);

  return {
    id: s._id,
    user_id: s.userId?._id || s.userId,
    user_email: s.userId?.email || s.userId?.mobile || null,
    plan_id: s.planId?._id || s.planId,
    plan_name: s.planId?.name || plan?.name || null,
    amount: roundMoney(s.amount),
    currency: 'USDT',
    reward_earned: roundMoney(s.rewardEarned),
    profit: roundMoney(profit),
    maturity_amount: roundMoney(maturityAmount),
    status: s.status,
    payout_type: plan?.payoutType || s.planId?.payoutType || 'end_of_plan',
    payout_mode: plan?.payoutMode || s.planId?.payoutMode || 'auto',
    payout_released: Boolean(s.payoutReleased),
    start_date: s.startDate,
    end_date: s.maturityDate,
    maturity_date: s.maturityDate,
    days_remaining: daysRemaining,
    is_matured: isMatured,
    admin_note: s.adminNote || '',
    created_at: s.createdAt,
  };
}

export async function createPlan(req, res, next) {
  try {
    const {
      name,
      apy_percent,
      roi_percent,
      lock_days,
      min_amount,
      max_amount,
      payout_type,
      payout_mode,
      requires_approval,
    } = req.body;

    const plan = await StakingPlan.create({
      name,
      apyPercent: roi_percent ?? apy_percent,
      lockDays: lock_days,
      minAmount: min_amount,
      maxAmount: max_amount,
      payoutType: payout_type || 'end_of_plan',
      payoutMode: payout_mode || 'auto',
      requiresApproval: Boolean(requires_approval),
      isActive: true,
    });

    return success(
      res,
      formatAdminPlan(plan.toObject(), {
        total_stakes_count: 0,
        total_amount_staked: 0,
        active_stakes_count: 0,
      }),
      'Investment plan created',
      201
    );
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
    return success(res, data, 'Investment plans fetched');
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

    const {
      name,
      apy_percent,
      roi_percent,
      min_amount,
      max_amount,
      is_active,
      payout_type,
      payout_mode,
      requires_approval,
    } = req.body;

    if (name != null) plan.name = name;
    if (roi_percent != null || apy_percent != null) plan.apyPercent = roi_percent ?? apy_percent;
    if (min_amount != null) plan.minAmount = min_amount;
    if (max_amount != null) plan.maxAmount = max_amount;
    if (is_active != null) plan.isActive = is_active;
    if (payout_type != null) plan.payoutType = payout_type;
    if (payout_mode != null) plan.payoutMode = payout_mode;
    if (requires_approval != null) plan.requiresApproval = requires_approval;

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
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit || req.query.pageSize) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    const [stakes, total, plans] = await Promise.all([
      UserStake.find(filter)
        .populate('userId', 'email mobile')
        .populate('planId', 'name apyPercent lockDays payoutType payoutMode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserStake.countDocuments(filter),
      StakingPlan.find().lean(),
    ]);

    const planMap = new Map(plans.map((p) => [String(p._id), p]));
    const items = stakes.map((s) =>
      formatAdminStake(s, planMap.get(String(s.planId?._id || s.planId)))
    );

    const totalPages = Math.ceil(total / limit) || 1;

    return success(
      res,
      {
        items,
        rows: items,
        total,
        page,
        pageSize: limit,
        totalPages,
        pagination: { page, limit, total, pages: totalPages },
      },
      'Investments fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function reviewStake(req, res, next) {
  try {
    const { action, note } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return error(res, 'action must be approve or reject', 400);
    }

    const result = await runWithTransaction(async (session) => {
      const stake = await UserStake.findById(req.params.id).session(session);
      if (!stake) throw Object.assign(new Error('Investment not found'), { status: 404 });
      if (stake.status !== 'pending') {
        throw Object.assign(new Error('Only pending investments can be reviewed'), { status: 400 });
      }

      if (action === 'reject') {
        stake.adminNote = note || '';
        await refundRejectedStake(stake, session);
        return { status: 'rejected' };
      }

      const plan = await StakingPlan.findById(stake.planId).session(session);
      const startDate = startOfDay();
      stake.startDate = startDate;
      stake.maturityDate = addDays(startDate, stake.lockDays);
      stake.status = 'active';
      stake.adminNote = note || '';
      await stake.save({ session });
      return { status: 'active', plan_name: plan?.name };
    });

    return success(res, result, action === 'approve' ? 'Investment approved' : 'Investment rejected');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function releaseStakePayout(req, res, next) {
  try {
    const payload = await runWithTransaction(async (session) => {
      const stake = await UserStake.findById(req.params.id).session(session);
      if (!stake) throw Object.assign(new Error('Investment not found'), { status: 404 });

      const today = startOfDay();
      const isMatured = stake.startDate && today >= startOfDay(stake.maturityDate);
      if (!isMatured && stake.status !== 'matured') {
        throw Object.assign(new Error('Investment has not matured yet'), { status: 400 });
      }

      return releaseMaturityPayout(stake, { session, markWithdrawn: true });
    });

    return success(res, payload, 'Payout released to user wallet');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}
