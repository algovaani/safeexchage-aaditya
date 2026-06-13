import { UserStake } from '../models/UserStake.js';
import {
  calculateEarnedSoFar,
  daysBetween,
  startOfDay,
} from '../utils/stakingMath.js';
import { storeMoney } from '../utils/money.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let timer = null;

/**
 * Daily reward accrual + auto-mature (wallet credit on manual withdraw only).
 */
export async function updateDailyRewards() {
  const today = startOfDay();
  const stakes = await UserStake.find({ status: 'active' });

  let updated = 0;
  let matured = 0;

  for (const stake of stakes) {
    const daysElapsed = daysBetween(stake.startDate, today);
    const totalEarned = calculateEarnedSoFar(stake.amount, stake.apyPercent, daysElapsed);

    stake.rewardEarned = totalEarned;

    if (today >= startOfDay(stake.maturityDate)) {
      stake.status = 'matured';
      matured += 1;
    }

    await stake.save();
    updated += 1;
  }

  console.log(
    `[stakingCron] Reward update complete — ${updated} stakes updated, ${matured} matured`
  );

  return { updated, matured };
}

export function startStakingCron() {
  if (timer) return;
  console.log('[stakingCron] Starting daily staking reward job (every 24h)');
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
