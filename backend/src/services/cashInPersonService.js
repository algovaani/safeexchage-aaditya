import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { roundMoney } from '../utils/money.js';
import { emitWalletUpdate } from './socketService.js';
import { clampBonusBalanceForUser, withdrawableGteExpr } from './walletAdjustmentService.js';
import { creditMain, debitMain, ensureWalletBuckets } from './walletBucketService.js';
import { releaseWithdrawalFunds } from './withdrawalService.js';

export function formatCashInPersonRequest(doc, { includeUser = false } = {}) {
  const payload = {
    id: doc._id,
    userId: doc.userId?._id || doc.userId,
    type: doc.type === 'withdraw' ? 'withdraw' : 'deposit',
    mobile: doc.mobile,
    city: doc.city,
    requestedAmount: doc.requestedAmount ?? null,
    creditedAmount: doc.creditedAmount ?? null,
    currency: doc.currency || 'USDT',
    status: doc.status,
    adminNote: doc.adminNote || '',
    transactionId: doc.transactionId || null,
    fundsLocked: Boolean(doc.fundsLocked),
    fundsLockedAmount: doc.fundsLockedAmount || 0,
    submittedAt: doc.createdAt,
    createdAt: doc.createdAt,
    reviewedAt: doc.reviewedAt || null,
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

export async function releaseCashInPersonWithdrawLock(request) {
  if (!request?.fundsLocked) return;
  const locked = roundMoney(request.fundsLockedAmount || request.requestedAmount || 0);
  if (!(locked > 0)) return;
  await releaseWithdrawalFunds(request.userId, locked).catch(() => {});
  request.fundsLocked = false;
  request.fundsLockedAmount = 0;
}

export async function approveCashInPersonRequest(request, reviewedBy, amount, io) {
  if (request.status !== 'pending') {
    throw Object.assign(new Error('Only pending requests can be approved'), { status: 400 });
  }

  const settleAmount = roundMoney(Number(amount));
  if (!(settleAmount > 0)) {
    throw Object.assign(new Error('A valid amount is required'), { status: 400 });
  }

  const isWithdraw = request.type === 'withdraw';
  let wallet;

  if (isWithdraw) {
    const lockedAmt = roundMoney(request.fundsLockedAmount || 0);
    if (request.fundsLocked && lockedAmt > 0) {
      // Funds already locked on submit — settle from locked + balance
      if (Math.abs(lockedAmt - settleAmount) > 0.01) {
        // Admin changed amount vs locked — adjust lock first
        if (settleAmount > lockedAmt) {
          const extra = roundMoney(settleAmount - lockedAmt);
          const bumped = await Wallet.findOneAndUpdate(
            {
              userId: request.userId,
              $expr: withdrawableGteExpr(extra),
            },
            { $inc: { lockedBalance: extra } },
            { new: true }
          );
          if (!bumped) {
            throw Object.assign(
              new Error('Insufficient withdrawable balance for increased settle amount'),
              { status: 400 }
            );
          }
        } else if (settleAmount < lockedAmt) {
          await releaseWithdrawalFunds(request.userId, roundMoney(lockedAmt - settleAmount));
        }
      }

      wallet = await Wallet.findOneAndUpdate(
        {
          userId: request.userId,
          lockedBalance: { $gte: settleAmount },
          balance: { $gte: settleAmount },
        },
        {
          $inc: {
            balance: -settleAmount,
            lockedBalance: -settleAmount,
          },
        },
        { new: true }
      );
      if (!wallet) {
        throw Object.assign(
          new Error('Insufficient balance or locked funds mismatch'),
          { status: 400 }
        );
      }
      request.fundsLocked = false;
      request.fundsLockedAmount = 0;
    } else {
      // Legacy pending requests without lock
      wallet = await Wallet.findOneAndUpdate(
        {
          userId: request.userId,
          $expr: withdrawableGteExpr(settleAmount),
        },
        { $inc: { balance: -settleAmount } },
        { new: true }
      );
      if (!wallet) {
        throw Object.assign(
          new Error('Insufficient withdrawable balance (referral bonus cannot be withdrawn)'),
          { status: 400 }
        );
      }
    }
    await clampBonusBalanceForUser(request.userId);
  } else {
    wallet = await Wallet.findOne({ userId: request.userId });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: request.userId,
        currency: 'USDT',
        balance: 0,
        mainBalance: 0,
        referralBalance: 0,
        bonusBalance: 0,
        lockedBalance: 0,
      });
    }
    ensureWalletBuckets(wallet);
    creditMain(wallet, settleAmount);
    await wallet.save();
  }

  const transaction = await Transaction.create({
    userId: request.userId,
    type: isWithdraw ? 'withdrawal' : 'deposit',
    amount: settleAmount,
    balanceAfter: roundMoney(wallet.balance),
    currency: 'USDT',
    status: 'completed',
    method: 'fiat',
    reference: `Cash in person ${isWithdraw ? 'withdraw' : 'deposit'} — ${request.city}`,
    adminNote: request.adminNote || '',
  });

  request.status = 'approved';
  request.creditedAmount = settleAmount;
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date();
  request.transactionId = transaction._id;
  await request.save();

  if (io) {
    await emitWalletUpdate(io, request.userId, {
      reason: isWithdraw ? 'cash_in_person_withdraw' : 'cash_in_person_deposit',
    });
  }

  return { request, wallet, transaction };
}

export async function rejectCashInPersonRequest(request, reviewedBy, note = '') {
  if (request.status !== 'pending') {
    throw Object.assign(new Error('Only pending requests can be rejected'), { status: 400 });
  }

  await releaseCashInPersonWithdrawLock(request);

  request.status = 'rejected';
  request.adminNote = note?.trim() || '';
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date();
  await request.save();

  return request;
}
