import path from 'path';
import { Deposit } from '../models/Deposit.js';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { storedFiatProofPath } from '../middleware/fiatDepositUpload.js';
import { toPublicFileUrl } from '../utils/fileUrl.js';
import { roundMoney, storeMoney } from '../utils/money.js';
import {
  computeDepositUsdtCredit,
  depositCreditReference,
  isNativeCryptoDeposit,
} from './depositConversionService.js';
import { creditAsset, debitAsset, getAssetBalance } from './assetBalanceService.js';
import { creditMain, creditBonus, ensureWalletBuckets } from './walletBucketService.js';
import { canTreasuryWithdraw } from './treasuryService.js';
import { completeLinkedTransaction, rejectLinkedTransaction } from './transactionService.js';
import { normalizeChainFromNetwork } from './userDepositAddressService.js';
import { getPlatformSettings, isManualDepositMode } from './platformSettingsService.js';

export function mapFiatProof(file) {
  if (!file) return null;
  return {
    path: storedFiatProofPath(path.basename(file.path)),
    originalName: file.originalname,
  };
}

export function formatDeposit(req, doc, { includeUser = false } = {}) {
  const paymentProof = doc.paymentProof?.path
    ? {
        url: toPublicFileUrl(req, doc.paymentProof.path),
        originalName: doc.paymentProof.originalName,
      }
    : null;

  const payload = {
    id: doc._id,
    userId: doc.userId?._id || doc.userId,
    type: doc.type,
    amount: doc.amount,
    currency: doc.currency || 'USDT',
    usdtAmount: doc.usdtAmount != null ? roundMoney(doc.usdtAmount) : null,
    conversionRate: doc.conversionRate != null ? doc.conversionRate : null,
    status: doc.status,
    txnHash: doc.txnHash || null,
    network: doc.network || null,
    utrNumber: doc.utrNumber || null,
    bankName: doc.bankName || null,
    accountNumber: doc.accountNumber || null,
    paymentProof,
    adminNote: doc.adminNote || '',
    transactionId: doc.transactionId || null,
    treasuryStatus: doc.treasuryStatus || 'not_applicable',
    canTreasuryWithdraw: canTreasuryWithdraw(doc),
    chain: doc.chain || normalizeChainFromNetwork(doc.network) || '',
    toAddress: doc.toAddress || doc.payhookDepositAddress || null,
    fromAddress: doc.fromAddress || null,
    source: doc.source || 'user',
    autoVerified: Boolean(doc.autoVerified),
    submittedAt: doc.createdAt,
    createdAt: doc.createdAt,
    reviewedAt: doc.reviewedAt || null,
    bonusPercent: doc.bonusPercent != null ? roundMoney(doc.bonusPercent) : 0,
    bonusFlat: doc.bonusFlat != null ? roundMoney(doc.bonusFlat) : 0,
    bonusAmount: doc.bonusAmount != null ? roundMoney(doc.bonusAmount) : 0,
  };

  if (includeUser && doc.userId && typeof doc.userId === 'object') {
    payload.user = {
      id: doc.userId._id,
      email: doc.userId.email || null,
      mobile: doc.userId.mobile || null,
      name: doc.userId.name || '',
    };
  }

  return payload;
}

export function computeDepositBonusAmount(creditUsdt, { bonusPercent = 0, bonusFlat = 0 } = {}) {
  const base = Number(creditUsdt);
  const pct = Math.max(0, Number(bonusPercent) || 0);
  const flat = Math.max(0, Number(bonusFlat) || 0);
  if (!(base > 0) && flat <= 0) return 0;
  return roundMoney(flat + ((base > 0 ? base : 0) * pct) / 100);
}

export async function creditWalletForDeposit(
  deposit,
  reviewedBy,
  { bonusPercent = 0, bonusFlat = 0 } = {}
) {
  const depositId = deposit?._id || deposit;
  if (!depositId) {
    throw Object.assign(new Error('Deposit not found'), { status: 404 });
  }

  // Atomic claim — only one concurrent approve can win (prevents double credit).
  const claimed = await Deposit.findOneAndUpdate(
    { _id: depositId, status: 'pending' },
    {
      $set: {
        status: 'approved',
        reviewedBy: reviewedBy || null,
        reviewedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!claimed) {
    throw Object.assign(new Error('Deposit is not pending'), { status: 400 });
  }

  const conversion = await computeDepositUsdtCredit(claimed).catch(async (convErr) => {
    await Deposit.updateOne(
      { _id: claimed._id, status: 'approved' },
      { $set: { status: 'pending', reviewedBy: null, reviewedAt: null } }
    );
    throw convErr;
  });
  claimed.usdtAmount = conversion.usdtAmount;
  claimed.conversionRate = conversion.conversionRate;

  const creditNativeAsset = isNativeCryptoDeposit(claimed);
  const currency = String(claimed.currency || 'USDT').toUpperCase();
  let wallet;
  let balanceAfter = null;
  let creditAmount;
  let creditCurrency;
  const bonusAmount =
    creditNativeAsset ? 0 : computeDepositBonusAmount(conversion.usdtAmount, { bonusPercent, bonusFlat });

  claimed.bonusPercent = roundMoney(Math.max(0, Number(bonusPercent) || 0));
  claimed.bonusFlat = roundMoney(Math.max(0, Number(bonusFlat) || 0));
  claimed.bonusAmount = bonusAmount;

  try {
    if (creditNativeAsset) {
      const assetRow = await creditAsset(claimed.userId, currency, claimed.amount);
      balanceAfter = assetRow?.balance != null ? roundMoney(assetRow.balance) : null;
      creditAmount = roundMoney(claimed.amount);
      creditCurrency = currency;
      wallet = await Wallet.findOne({ userId: claimed.userId }).lean();
    } else {
      wallet = await Wallet.findOne({ userId: claimed.userId });
      if (!wallet) {
        wallet = await Wallet.create({
          userId: claimed.userId,
          currency: 'USDT',
          balance: 0,
          mainBalance: 0,
          referralBalance: 0,
          bonusBalance: 0,
          lockedBalance: 0,
        });
      }
      ensureWalletBuckets(wallet);
      creditMain(wallet, conversion.usdtAmount);
      if (bonusAmount > 0) creditBonus(wallet, bonusAmount);
      await wallet.save();
      balanceAfter = roundMoney(wallet.balance);
      creditAmount = conversion.usdtAmount;
      creditCurrency = 'USDT';
    }
  } catch (creditErr) {
    // Only roll back claim if wallet was not credited.
    await Deposit.updateOne(
      { _id: claimed._id, status: 'approved' },
      { $set: { status: 'pending', reviewedBy: null, reviewedAt: null } }
    );
    throw creditErr;
  }

  const creditReference = depositCreditReference(claimed);

  let transaction;
  if (claimed.transactionId) {
    transaction = await completeLinkedTransaction(claimed, {
      balanceAfter,
      status: 'completed',
      amount: creditAmount,
      currency: creditCurrency,
      reference: creditReference,
    });
  }

  if (!transaction) {
    transaction = await Transaction.create({
      userId: claimed.userId,
      type: 'deposit',
      amount: creditAmount,
      balanceAfter,
      currency: creditCurrency,
      status: 'completed',
      method: claimed.type === 'crypto' ? 'crypto' : 'fiat',
      reference: creditReference,
      depositId: claimed._id,
      adminNote: bonusAmount > 0 ? `Includes ${bonusAmount} USDT trading bonus` : '',
    });
    claimed.transactionId = transaction._id;
  } else if (bonusAmount > 0) {
    await Transaction.findByIdAndUpdate(transaction._id, {
      $set: {
        adminNote: `Includes ${bonusAmount} USDT trading bonus`,
      },
    });
  }

  if (bonusAmount > 0 && !creditNativeAsset) {
    await Transaction.create({
      userId: claimed.userId,
      type: 'deposit_bonus',
      amount: bonusAmount,
      balanceAfter,
      currency: 'USDT',
      status: 'completed',
      method: 'manual',
      reference: `Deposit bonus: ${claimed._id}`,
      depositId: claimed._id,
      adminNote: 'Trading only — not withdrawable',
    });
  }

  if (claimed.type === 'crypto') {
    const settings = await getPlatformSettings();
    claimed.treasuryStatus = isManualDepositMode(settings) ? 'not_applicable' : 'pending_sweep';
    if (!claimed.chain) {
      claimed.chain = normalizeChainFromNetwork(claimed.network) || '';
    }
  }
  if (!claimed.transactionId) {
    claimed.transactionId = transaction._id;
  }
  await claimed.save();

  return { wallet, transaction, deposit: claimed };
}

/** Reject deposit and reverse wallet credit if it was approved/auto-credited. */
export async function rejectDepositWithReversal(deposit, reviewedBy, note = '') {
  const wasApproved = deposit.status === 'approved';

  if (wasApproved) {
    const currency = String(deposit.currency || 'USDT').toUpperCase();
    const creditNativeAsset = isNativeCryptoDeposit(deposit);

    if (creditNativeAsset) {
      try {
        await debitAsset(deposit.userId, currency, deposit.amount);
      } catch {
        /* best-effort reversal */
      }
      const balanceAfter = roundMoney(await getAssetBalance(deposit.userId, currency));
      await Transaction.create({
        userId: deposit.userId,
        type: 'withdrawal',
        amount: roundMoney(deposit.amount),
        balanceAfter,
        currency,
        status: 'completed',
        method: 'manual',
        reference: `Reversal: deposit ${deposit._id}`,
        depositId: deposit._id,
        adminNote: note?.trim() || 'Admin rejected deposit',
      });
    } else {
      const usdtAmount = deposit.usdtAmount ?? deposit.amount;
      const bonusAmount = roundMoney(deposit.bonusAmount || 0);
      const wallet = await Wallet.findOne({ userId: deposit.userId });
      if (wallet) {
        const totalDebit = roundMoney(usdtAmount + bonusAmount);
        const debit = Math.min(wallet.balance, totalDebit);
        if (debit > 0) {
          const bonusDebit = Math.min(wallet.bonusBalance || 0, bonusAmount, debit);
          wallet.balance = roundMoney(wallet.balance - debit);
          if (bonusDebit > 0) {
            wallet.bonusBalance = roundMoney(Math.max(0, (wallet.bonusBalance || 0) - bonusDebit));
          }
          await wallet.save();
          await Transaction.create({
            userId: deposit.userId,
            type: 'withdrawal',
            amount: debit,
            balanceAfter: roundMoney(wallet.balance),
            currency: 'USDT',
            status: 'completed',
            method: 'manual',
            reference: `Reversal: deposit ${deposit._id}`,
            depositId: deposit._id,
            adminNote: note?.trim() || 'Admin rejected deposit',
          });
        }
      }
    }
    if (deposit.transactionId) {
      await rejectLinkedTransaction(deposit, note);
    }
  } else {
    await rejectLinkedTransaction(deposit, note);
  }

  deposit.status = 'rejected';
  deposit.adminNote = note?.trim() || '';
  deposit.reviewedBy = reviewedBy;
  deposit.reviewedAt = new Date();
  deposit.treasuryStatus = 'not_applicable';
  await deposit.save();

  return deposit;
}

/**
 * Fix approved non-USDT crypto deposits that were incorrectly credited as USDT.
 * Idempotent — skips deposits already recorded in the native asset currency.
 */
export async function repairMisCreditedNativeDeposits({ userId } = {}) {
  const filter = {
    type: 'crypto',
    status: 'approved',
    currency: { $nin: ['USDT', 'usdt'] },
  };
  if (userId) filter.userId = userId;

  const deposits = await Deposit.find(filter).lean();
  let repaired = 0;

  for (const dep of deposits) {
    if (!isNativeCryptoDeposit(dep) || !dep.transactionId) continue;

    const tx = await Transaction.findById(dep.transactionId).lean();
    if (!tx || tx.status !== 'completed') continue;

    const currency = String(dep.currency || '').toUpperCase();
    if (tx.currency === currency) continue;
    if (tx.currency !== 'USDT') continue;

    // Claim this deposit atomically so concurrent repairs cannot double-credit.
    const claimed = await Transaction.findOneAndUpdate(
      { _id: dep.transactionId, currency: 'USDT', status: 'completed' },
      {
        amount: roundMoney(dep.amount),
        currency,
        reference: depositCreditReference({ ...dep, _id: dep._id }),
      },
      { new: true }
    );
    if (!claimed) continue;

    const usdtAmount = roundMoney(dep.usdtAmount ?? tx.amount);

    const wallet = await Wallet.findOne({ userId: dep.userId });
    if (wallet && usdtAmount > 0) {
      const debit = Math.min(wallet.balance, usdtAmount);
      if (debit > 0) {
        wallet.balance = roundMoney(wallet.balance - debit);
        await wallet.save();
      }
    }

    const assetRow = await creditAsset(dep.userId, currency, dep.amount);
    const balanceAfter = roundMoney(assetRow?.balance ?? 0);

    await Transaction.findByIdAndUpdate(dep.transactionId, { balanceAfter });

    repaired += 1;
    console.info(
      `[deposits] repaired ${dep.amount} ${currency} for user ${dep.userId} (removed ${usdtAmount} USDT miscredit)`
    );
  }

  return { repaired, scanned: deposits.length };
}
