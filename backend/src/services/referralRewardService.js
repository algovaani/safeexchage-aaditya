import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { roundMoney } from '../utils/money.js';
import { getPlatformSettings } from './platformSettingsService.js';

export async function getReferralRewardAmount() {
  const settings = await getPlatformSettings();
  const amount = Number(settings.referralRewardUsdt ?? 0);
  return amount > 0 ? roundMoney(amount) : 0;
}

/** Credit referrer wallet when someone signs up with their code. */
export async function creditReferrerForSignup({ referrerId, referredUserId, referredLabel }) {
  const amount = await getReferralRewardAmount();
  if (!(amount > 0)) return null;

  const wallet = await Wallet.findOneAndUpdate(
    { userId: referrerId },
    { $inc: { balance: amount, bonusBalance: amount }, $setOnInsert: { currency: 'USDT' } },
    { upsert: true, new: true }
  );

  const label = String(referredLabel || referredUserId || '').trim() || 'new user';

  await Transaction.create({
    userId: referrerId,
    type: 'referral_reward',
    amount,
    balanceAfter: roundMoney(wallet.balance),
    currency: 'USDT',
    status: 'completed',
    method: 'manual',
    reference: `Referral reward — ${label}`,
    adminNote: `Referred user ${referredUserId}`,
  });

  return { amount, balanceAfter: roundMoney(wallet.balance) };
}

/** One-shot: mark historical referral rewards as non-withdrawable bonus. */
export async function backfillReferralBonusBalances() {
  const rows = await Transaction.aggregate([
    { $match: { type: 'referral_reward', status: 'completed' } },
    { $group: { _id: '$userId', total: { $sum: '$amount' } } },
  ]);

  let updated = 0;
  for (const row of rows) {
    if (!row._id || !(row.total > 0)) continue;
    const wallet = await Wallet.findOne({ userId: row._id });
    if (!wallet) continue;
    const target = roundMoney(Math.min(Number(row.total) || 0, Number(wallet.balance) || 0));
    if (target <= 0) continue;
    if (roundMoney(wallet.bonusBalance || 0) >= target) continue;
    wallet.bonusBalance = target;
    await wallet.save();
    updated += 1;
  }
  return { scanned: rows.length, updated };
}
