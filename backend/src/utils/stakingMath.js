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

/** Earned reward for elapsed days */
export function calculateEarnedSoFar(amount, apyPercent, daysElapsed) {
  const earned = (Number(amount) * Number(apyPercent) / 100 / 365) * daysElapsed;
  return storeMoney(earned);
}

/** Full reward at maturity (lock_days) */
export function calculateMaturityReward(amount, apyPercent, lockDays) {
  const reward = (Number(amount) * Number(apyPercent) / 100 / 365) * lockDays;
  return storeMoney(reward);
}

export function planLabel(apyPercent, lockDays) {
  return `Earn ${roundMoney(apyPercent)}% APY in ${lockDays} days`;
}
