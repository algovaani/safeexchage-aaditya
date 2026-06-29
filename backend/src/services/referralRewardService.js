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
    { $inc: { balance: amount }, $setOnInsert: { currency: 'USDT' } },
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
