import { roundMoney, storeMoney } from './money.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(startDate, endDate = new Date()) {
  const start = startOfDay(startDate).getTime();
  const end = startOfDay(endDate).getTime();
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

/** Total ROI % applies to the full lock period (e.g. 15% on 30 days). */
export function calculateMaturityReward(amount, roiPercent, lockDays) {
  void lockDays;
  const reward = (Number(amount) * Number(roiPercent)) / 100;
  return storeMoney(reward);
}

export function calculateMaturityAmount(amount, roiPercent, lockDays) {
  return storeMoney(Number(amount) + calculateMaturityReward(amount, roiPercent, lockDays));
}

/** Daily payout slice for daily plans. */
export function calculateDailyReward(amount, roiPercent, lockDays) {
  const total = calculateMaturityReward(amount, roiPercent, lockDays);
  if (!lockDays) return 0;
  return storeMoney(total / lockDays);
}

/** Earned reward for elapsed days (daily accrual view). */
export function calculateEarnedSoFar(amount, roiPercent, lockDays, daysElapsed) {
  const daily = calculateDailyReward(amount, roiPercent, lockDays);
  return storeMoney(daily * daysElapsed);
}

export function planLabel(roiPercent, lockDays) {
  return `${roundMoney(roiPercent)}% ROI · ${lockDays} days · USDT`;
}
