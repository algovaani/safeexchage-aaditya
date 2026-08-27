import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { roundMoney, storeMoney } from '../utils/money.js';

/** Ensure legacy wallets have bucket fields populated. */
export function ensureWalletBuckets(wallet) {
  if (!wallet) return wallet;

  const locked = storeMoney(wallet.lockedBalance || 0);
  const total = storeMoney(wallet.balance || 0);
  let main = storeMoney(wallet.mainBalance || 0);
  let referral = storeMoney(wallet.referralBalance || 0);
  let bonus = storeMoney(wallet.bonusBalance || 0);

  const bucketSum = storeMoney(main + referral + bonus);

  // Legacy wallets stored everything in `balance` only — assign unallocated funds to main.
  if (bucketSum + 1e-8 < total) {
    main = storeMoney(main + (total - bucketSum));
  } else if (bucketSum > total + 1e-8) {
    // Buckets exceed total (drift) — clamp referral/bonus then main.
    referral = storeMoney(Math.min(referral, total));
    bonus = storeMoney(Math.min(bonus, Math.max(0, total - referral)));
    main = storeMoney(Math.max(0, total - referral - bonus));
  }

  wallet.mainBalance = main;
  wallet.referralBalance = referral;
  wallet.bonusBalance = bonus;
  wallet.lockedBalance = locked;
  syncTotalBalance(wallet);
  return wallet;
}

export function syncTotalBalance(wallet) {
  if (!wallet) return 0;
  wallet.balance = storeMoney(
    (wallet.mainBalance || 0) + (wallet.referralBalance || 0) + (wallet.bonusBalance || 0)
  );
  return wallet.balance;
}

/**
 * Liquid main available for trade / withdraw / stake.
 * Stake locks already debit mainBalance — when locked > main, do not subtract again.
 * When locked <= main, locks are reservations on liquid main (pending withdraw, futures margin).
 */
export function mainBalanceFree(wallet) {
  ensureWalletBuckets(wallet);
  const main = storeMoney(wallet.mainBalance || 0);
  const locked = storeMoney(wallet.lockedBalance || 0);
  if (!(locked > 0)) return main;
  if (locked > main + 1e-8) return main;
  return storeMoney(Math.max(0, main - locked));
}

/** Tradeable = free main + referral + bonus buckets. */
export function tradeableBalance(wallet) {
  ensureWalletBuckets(wallet);
  return storeMoney(
    mainBalanceFree(wallet) + (wallet.referralBalance || 0) + (wallet.bonusBalance || 0)
  );
}

/** Withdrawable = free main only (referral/bonus are trade-only). */
export function withdrawableBalance(wallet) {
  return storeMoney(mainBalanceFree(wallet));
}

/**
 * Trade debit order: bonus → referral → main (unlocked).
 * Mutates wallet in memory; caller must save.
 */
export function debitForTrade(wallet, amount) {
  ensureWalletBuckets(wallet);
  let remaining = storeMoney(amount);
  if (!(remaining > 0)) return { debited: 0, from: { bonus: 0, referral: 0, main: 0 } };

  const from = { bonus: 0, referral: 0, main: 0 };

  const takeBonus = Math.min(remaining, wallet.bonusBalance || 0);
  if (takeBonus > 0) {
    wallet.bonusBalance = storeMoney(wallet.bonusBalance - takeBonus);
    from.bonus = takeBonus;
    remaining = storeMoney(remaining - takeBonus);
  }

  if (remaining > 0) {
    const takeReferral = Math.min(remaining, wallet.referralBalance || 0);
    if (takeReferral > 0) {
      wallet.referralBalance = storeMoney(wallet.referralBalance - takeReferral);
      from.referral = takeReferral;
      remaining = storeMoney(remaining - takeReferral);
    }
  }

  if (remaining > 0) {
    const mainFree = mainBalanceFree(wallet);
    if (mainFree + 1e-10 < remaining) {
      throw Object.assign(new Error('Insufficient USDT balance'), { status: 400 });
    }
    wallet.mainBalance = storeMoney(wallet.mainBalance - remaining);
    from.main = remaining;
    remaining = 0;
  }

  syncTotalBalance(wallet);
  return { debited: amount, from };
}

/** Trading profits always credit main wallet. */
export function creditTradeProfit(wallet, amount) {
  ensureWalletBuckets(wallet);
  const qty = storeMoney(amount);
  if (!(qty > 0)) return wallet;
  wallet.mainBalance = storeMoney((wallet.mainBalance || 0) + qty);
  syncTotalBalance(wallet);
  return wallet;
}

/** Deposits, admin main credits, staking returns. */
export function creditMain(wallet, amount) {
  ensureWalletBuckets(wallet);
  const qty = storeMoney(amount);
  if (!(qty > 0)) return wallet;
  wallet.mainBalance = storeMoney((wallet.mainBalance || 0) + qty);
  syncTotalBalance(wallet);
  return wallet;
}

export function creditReferral(wallet, amount) {
  ensureWalletBuckets(wallet);
  const qty = storeMoney(amount);
  if (!(qty > 0)) return wallet;
  wallet.referralBalance = storeMoney((wallet.referralBalance || 0) + qty);
  syncTotalBalance(wallet);
  return wallet;
}

export function creditBonus(wallet, amount) {
  ensureWalletBuckets(wallet);
  const qty = storeMoney(amount);
  if (!(qty > 0)) return wallet;
  wallet.bonusBalance = storeMoney((wallet.bonusBalance || 0) + qty);
  syncTotalBalance(wallet);
  return wallet;
}

/** Staking / withdraw — main only. */
export function debitMain(wallet, amount) {
  ensureWalletBuckets(wallet);
  const qty = storeMoney(amount);
  const free = mainBalanceFree(wallet);
  if (free + 1e-10 < qty) {
    throw Object.assign(new Error('Insufficient main wallet balance'), { status: 400 });
  }
  wallet.mainBalance = storeMoney(wallet.mainBalance - qty);
  syncTotalBalance(wallet);
  return wallet;
}

/** Mongo $expr: withdrawable (free main) >= amount */
export function withdrawableGteExpr(amount) {
  const mainField = {
    $ifNull: [
      '$mainBalance',
      {
        $subtract: [
          '$balance',
          { $add: [{ $ifNull: ['$referralBalance', 0] }, { $ifNull: ['$bonusBalance', 0] }] },
        ],
      },
    ],
  };
  return {
    $gte: [
      {
        $cond: {
          if: { $gt: [{ $ifNull: ['$lockedBalance', 0] }, mainField] },
          then: mainField,
          else: {
            $subtract: [mainField, { $ifNull: ['$lockedBalance', 0] }],
          },
        },
      },
      amount,
    ],
  };
}

export function formatWalletBuckets(wallet) {
  ensureWalletBuckets(wallet);
  const main = roundMoney(wallet.mainBalance || 0);
  const referral = roundMoney(wallet.referralBalance || 0);
  const bonus = roundMoney(wallet.bonusBalance || 0);
  const locked = roundMoney(wallet.lockedBalance || 0);
  const total = roundMoney(wallet.balance || 0);
  const tradeable = roundMoney(tradeableBalance(wallet));
  const withdrawable = roundMoney(withdrawableBalance(wallet));
  const mainFree = roundMoney(mainBalanceFree(wallet));

  return {
    main_balance: main,
    referral_balance: referral,
    bonus_balance: bonus,
    locked_balance: locked,
    balance_usdt: total,
    balance: total,
    available_balance: tradeable,
    tradeable_balance: tradeable,
    withdrawable_balance: withdrawable,
    main_available: mainFree,
    currency: wallet?.currency || 'USDT',
  };
}

/** Reconcile wallet buckets (legacy balance → main, referral/bonus from tx history). */
export async function migrateAllWalletBuckets() {
  const wallets = await Wallet.find({});
  let updated = 0;

  for (const wallet of wallets) {
    const before = {
      main: storeMoney(wallet.mainBalance || 0),
      referral: storeMoney(wallet.referralBalance || 0),
      bonus: storeMoney(wallet.bonusBalance || 0),
    };

    const total = storeMoney(wallet.balance || 0);
    const bucketSum = storeMoney(before.main + before.referral + before.bonus);

    // First-time split: assign referral/bonus from transaction history, rest → main.
    if (total > 0 && bucketSum + 1e-8 < total) {
      const userId = wallet.userId;
      const [referralRows, bonusRows, adminRows] = await Promise.all([
        Transaction.aggregate([
          { $match: { userId, type: 'referral_reward', status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Transaction.aggregate([
          { $match: { userId, type: 'deposit_bonus', status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Transaction.aggregate([
          { $match: { userId, type: 'admin_credit', status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      const referralFromTx = roundMoney(Number(referralRows[0]?.total) || 0);
      const bonusFromTx = roundMoney(Number(bonusRows[0]?.total) || 0);
      const legacyBonus = storeMoney(wallet.bonusBalance || 0);

      let referral = storeMoney(Math.min(referralFromTx, total));
      let bonus = storeMoney(Math.min(bonusFromTx, Math.max(0, total - referral)));

      if (referral + bonus < 1e-8 && legacyBonus > 0) {
        referral = storeMoney(Math.min(legacyBonus, total));
        bonus = storeMoney(Math.max(0, legacyBonus - referral));
      }

      wallet.referralBalance = referral;
      wallet.bonusBalance = bonus;
      wallet.mainBalance = storeMoney(Math.max(0, total - referral - bonus));
      void adminRows;
    }

    ensureWalletBuckets(wallet);

    const after = {
      main: storeMoney(wallet.mainBalance || 0),
      referral: storeMoney(wallet.referralBalance || 0),
      bonus: storeMoney(wallet.bonusBalance || 0),
    };

    if (
      after.main !== before.main ||
      after.referral !== before.referral ||
      after.bonus !== before.bonus
    ) {
      await wallet.save();
      updated += 1;
    }
  }

  return { scanned: wallets.length, updated };
}
