import { UserStake } from '../models/UserStake.js';
import { StakingPlan } from '../models/StakingPlan.js';
import {
  calculateEarnedSoFar,
  daysBetween,
  startOfDay,
} from '../utils/stakingMath.js';
import {
  creditDailyReward,
  releaseMaturityPayout,
} from './stakingPayoutService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let timer = null;

export async function updateDailyRewards() {
  const today = startOfDay();
  const stakes = await UserStake.find({ status: { $in: ['active', 'matured'] } }).lean();
  const planIds = [...new Set(stakes.map((s) => String(s.planId)))];
  const plans = await StakingPlan.find({ _id: { $in: planIds } }).lean();
  const planMap = new Map(plans.map((p) => [String(p._id), p]));

  let updated = 0;
  let matured = 0;
  let dailyPaid = 0;
  let autoReleased = 0;

  for (const row of stakes) {
    const stake = await UserStake.findById(row._id);
    if (!stake || !['active', 'matured'].includes(stake.status)) continue;

    const plan = planMap.get(String(stake.planId));
    const payoutType = plan?.payoutType || 'end_of_plan';
    const payoutMode = plan?.payoutMode || 'auto';

    if (stake.status === 'active' && stake.startDate) {
      const daysElapsed = daysBetween(stake.startDate, today);
      stake.rewardEarned = calculateEarnedSoFar(
        stake.amount,
        stake.apyPercent,
        stake.lockDays,
        daysElapsed
      );

      if (payoutType === 'daily' && payoutMode === 'auto') {
        const last = stake.lastDailyPayoutAt ? startOfDay(stake.lastDailyPayoutAt) : null;
        if (!last || last < today) {
          try {
            await creditDailyReward(stake, plan);
            dailyPaid += 1;
          } catch (err) {
            console.error('[stakingCron] Daily payout error:', err.message);
          }
        }
      }
    }

    const isMatured = stake.startDate && today >= startOfDay(stake.maturityDate);
    if (isMatured && stake.status === 'active') {
      stake.status = 'matured';
      matured += 1;
    }

    if (
      isMatured &&
      !stake.payoutReleased &&
      payoutMode === 'auto' &&
      payoutType === 'end_of_plan'
    ) {
      try {
        await releaseMaturityPayout(stake, { markWithdrawn: true });
        autoReleased += 1;
        updated += 1;
        continue;
      } catch (err) {
        console.error('[stakingCron] Auto release error:', err.message);
      }
    }

    await stake.save();
    updated += 1;
  }

  console.log(
    `[stakingCron] ${updated} updated, ${matured} matured, ${dailyPaid} daily payouts, ${autoReleased} auto-released`
  );

  return { updated, matured, dailyPaid, autoReleased };
}

export function startStakingCron() {
  if (timer) return;
  console.log('[stakingCron] Starting daily investment job (every 24h)');
  timer = setInterval(() => {
    updateDailyRewards().catch((err) => {
      console.error('[stakingCron] Error:', err.message);
    });
  }, DAY_MS);

  updateDailyRewards().catch((err) => {
    console.error('[stakingCron] Initial run error:', err.message);
  });
}

export function stopStakingCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
