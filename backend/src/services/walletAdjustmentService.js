import mongoose from 'mongoose';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { roundMoney, storeMoney } from '../utils/money.js';
import {
  creditBonus,
  creditMain,
  creditReferral,
  debitForTrade,
  debitMain,
  ensureWalletBuckets,
  formatWalletBuckets,
  migrateAllWalletBuckets,
  syncTotalBalance,
  tradeableBalance,
  withdrawableBalance,
  withdrawableGteExpr,
} from './walletBucketService.js';

export {
  tradeableBalance,
  withdrawableBalance,
  withdrawableGteExpr,
  migrateAllWalletBuckets,
};

/** @deprecated Use wallet bucket service — kept for callers still importing applyBonusClamp */
export function applyBonusClamp(wallet) {
  ensureWalletBuckets(wallet);
  return wallet;
}

export async function clampBonusBalanceForUser(userId) {
  if (!userId) return;
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) return;
  ensureWalletBuckets(wallet);
  await wallet.save();
}

export function formatWalletSnapshot(wallet, assets = []) {
  const buckets = formatWalletBuckets(wallet);
  return {
    ...buckets,
    assets,
  };
}

/** Add assets_usdt + total_balance_usdt from live prices (spot portfolio value). */
export function enrichWalletSnapshotWithPrices(snapshot, prices = {}) {
  if (!snapshot) return snapshot;
  let assetsUsdt = 0;
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets : [];
  for (const row of assets) {
    const asset = String(row.asset || '').toUpperCase();
    if (!asset || asset === 'USDT') continue;
    const qty = Number(row.balance) || 0;
    if (!(qty > 0)) continue;
    const px = Number(prices[`${asset}USDT`] ?? prices[`${asset}INR`] ?? 0);
    if (px > 0) assetsUsdt += qty * px;
  }
  snapshot.assets_usdt = roundMoney(assetsUsdt);
  snapshot.total_balance_usdt = roundMoney((Number(snapshot.balance_usdt) || 0) + assetsUsdt);
  return snapshot;
}

export async function adjustUserWalletBalance({
  userId,
  adminId,
  action,
  amount,
  remark,
  withdrawable = true,
  bucket = 'main',
}) {
  const normalizedAction = action === 'add' ? 'add' : 'deduct';
  const value = storeMoney(amount);
  if (!(value > 0)) {
    throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });
  }

  const note = String(remark || '').trim();
  if (!note) {
    throw Object.assign(new Error('Remark is required'), { status: 400 });
  }

  const user = await User.findById(userId).select('_id email mobile name role');
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      [wallet] = await Wallet.create(
        [
          {
            userId,
            balance: 0,
            mainBalance: 0,
            referralBalance: 0,
            bonusBalance: 0,
            lockedBalance: 0,
            currency: 'USDT',
          },
        ],
        { session }
      );
    }

    ensureWalletBuckets(wallet);

    if (normalizedAction === 'deduct') {
      if (bucket === 'referral' || bucket === 'bonus') {
        const pool = bucket === 'referral' ? wallet.referralBalance : wallet.bonusBalance;
        if ((pool || 0) + 1e-10 < value) {
          throw Object.assign(new Error(`Insufficient ${bucket} wallet balance`), { status: 400 });
        }
        if (bucket === 'referral') wallet.referralBalance = storeMoney(wallet.referralBalance - value);
        else wallet.bonusBalance = storeMoney(wallet.bonusBalance - value);
        syncTotalBalance(wallet);
      } else {
        debitMain(wallet, value);
      }
    } else if (normalizedAction === 'add') {
      if (bucket === 'referral') creditReferral(wallet, value);
      else if (bucket === 'bonus' || !withdrawable) creditBonus(wallet, value);
      else creditMain(wallet, value);
    }

    const txType = normalizedAction === 'add' ? 'admin_credit' : 'admin_debit';

    const [transaction] = await Transaction.create(
      [
        {
          userId,
          type: txType,
          amount: roundMoney(value),
          balanceAfter: roundMoney(wallet.balance),
          currency: 'USDT',
          status: 'completed',
          method: 'manual',
          reference: `admin_${normalizedAction}:${adminId}`,
          adminNote: `${note} [${bucket || 'main'}]`,
        },
      ],
      { session }
    );

    await wallet.save({ session });
    await session.commitTransaction();

    return {
      user: {
        id: user._id,
        email: user.email,
        mobile: user.mobile,
        name: user.name,
      },
      transaction: {
        id: transaction._id,
        type: transaction.type,
        amount: roundMoney(transaction.amount),
        balance_after: roundMoney(wallet.balance),
        remark: note,
        created_at: transaction.createdAt,
      },
      ...formatWalletSnapshot(wallet),
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export function formatFundAdjustment(tx) {
  return {
    id: tx._id,
    type: tx.type,
    action: tx.type === 'admin_credit' ? 'add' : 'deduct',
    amount: roundMoney(tx.amount),
    balance_after: tx.balanceAfter != null ? roundMoney(tx.balanceAfter) : null,
    remark: tx.adminNote || '',
    date: tx.createdAt,
    status: tx.status,
  };
}

export async function releaseAdminCreditsFromBonusBalance() {
  return migrateAllWalletBuckets();
}

export { debitForTrade, creditMain, creditReferral, creditBonus, debitMain, ensureWalletBuckets, creditTradeProfit } from './walletBucketService.js';
