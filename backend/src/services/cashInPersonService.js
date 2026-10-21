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
    debitedFromMain: Boolean(doc.debitedFromMain),
    debitedAmount: doc.debitedAmount || 0,
    submittedAt: doc.createdAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    reviewedAt: doc.reviewedAt || null,
    utrNumber: doc.utrNumber || '',
    paymentProof: doc.paymentProof || '',
    bankName: doc.bankName || '',
    accountNumber: doc.accountNumber || '',
    ifsc: doc.ifsc || '',
    accountHolder: doc.accountHolder || '',
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
    if (request.debitedFromMain) {
      // Funds were already debited from main wallet on submit
      const alreadyDebited = roundMoney(request.debitedAmount || request.requestedAmount || 0);
      if (Math.abs(alreadyDebited - settleAmount) > 0.01) {
        if (settleAmount > alreadyDebited) {
          // Admin increased settle amount: debit additional difference from main
          const extra = roundMoney(settleAmount - alreadyDebited);
          wallet = await Wallet.findOneAndUpdate(
            {
              userId: request.userId,
              $expr: withdrawableGteExpr(extra),
            },
            {
              $inc: {
                mainBalance: -extra,
                balance: -extra,
              },
            },
            { new: true }
          );
          if (!wallet) {
            throw Object.assign(
              new Error('Insufficient withdrawable balance for increased settle amount'),
              { status: 400 }
            );
          }
        } else if (settleAmount < alreadyDebited) {
          // Admin decreased settle amount: refund the difference back to main
          const refund = roundMoney(alreadyDebited - settleAmount);
          wallet = await Wallet.findOneAndUpdate(
            { userId: request.userId },
            {
              $inc: {
                mainBalance: refund,
                balance: refund,
              },
            },
            { new: true }
          );
        }
      }
      if (!wallet) {
        wallet = await Wallet.findOne({ userId: request.userId });
      }
    } else {
      const lockedAmt = roundMoney(request.fundsLockedAmount || 0);
      if (request.fundsLocked && lockedAmt > 0) {
        // Funds already locked on submit (legacy) — settle from locked + balance
        if (Math.abs(lockedAmt - settleAmount) > 0.01) {
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
          { $inc: { balance: -settleAmount, mainBalance: -settleAmount } },
          { new: true }
        );
        if (!wallet) {
          throw Object.assign(
            new Error('Insufficient withdrawable balance (referral bonus cannot be withdrawn)'),
            { status: 400 }
          );
        }
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

  let transaction = null;
  if (request.transactionId) {
    transaction = await Transaction.findByIdAndUpdate(
      request.transactionId,
      {
        amount: settleAmount,
        balanceAfter: roundMoney(wallet?.balance || 0),
        status: 'completed',
        adminNote: request.adminNote || '',
      },
      { new: true }
    );
  }

  if (!transaction) {
    transaction = await Transaction.create({
      userId: request.userId,
      type: isWithdraw ? 'withdrawal' : 'deposit',
      amount: settleAmount,
      balanceAfter: roundMoney(wallet?.balance || 0),
      currency: 'USDT',
      status: 'completed',
      method: 'fiat',
      reference: `Cash in person ${isWithdraw ? 'withdraw' : 'deposit'} — ${request.city}`,
      adminNote: request.adminNote || '',
    });
  }

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

export async function rejectCashInPersonRequest(request, reviewedBy, note = '', io = null) {
  if (request.status !== 'pending') {
    throw Object.assign(new Error('Only pending requests can be rejected'), { status: 400 });
  }

  if (request.type === 'withdraw') {
    if (request.debitedFromMain) {
      // Refund debited funds back to main wallet
      const refund = roundMoney(request.debitedAmount || request.requestedAmount || 0);
      if (refund > 0) {
        await Wallet.findOneAndUpdate(
          { userId: request.userId },
          {
            $inc: {
              mainBalance: refund,
              balance: refund,
            },
          }
        );
      }
      if (request.transactionId) {
        await Transaction.findByIdAndUpdate(request.transactionId, {
          status: 'rejected',
          adminNote: note?.trim() || 'Request rejected by admin',
        }).catch(() => {});
      }
    } else if (request.fundsLocked) {
      await releaseCashInPersonWithdrawLock(request);
    }
  }

  request.status = 'rejected';
  request.adminNote = note?.trim() || '';
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date();
  await request.save();

  if (io && request.type === 'withdraw') {
    await emitWalletUpdate(io, request.userId, {
      reason: 'cash_in_person_withdraw_reject',
    }).catch(() => {});
  }

  return request;
}
