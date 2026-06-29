import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { roundMoney } from '../utils/money.js';
import {
  completeLinkedTransaction,
  createPendingWithdrawalTransaction,
  rejectLinkedTransaction,
} from './transactionService.js';

export function formatWithdrawal(req, doc, { includeUser = false } = {}) {
  const payload = {
    id: doc._id,
    userId: doc.userId?._id || doc.userId,
    type: doc.type,
    amount: doc.amount,
    currency: doc.currency || 'USDT',
    status: doc.status,
    walletAddress: doc.walletAddress || null,
    network: doc.network || null,
    bankName: doc.bankName || null,
    accountNumber: doc.accountNumber || null,
    ifsc: doc.ifsc || null,
    accountHolder: doc.accountHolder || null,
    adminNote: doc.adminNote || '',
    transactionId: doc.transactionId || null,
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

export async function reserveWithdrawalFunds(userId, amount) {
  const parsed = roundMoney(amount);
  const wallet = await Wallet.findOneAndUpdate(
    {
      userId,
      $expr: {
        $gte: [{ $subtract: ['$balance', '$lockedBalance'] }, parsed],
      },
    },
    { $inc: { lockedBalance: parsed } },
    { new: true }
  );

  if (!wallet) {
    throw Object.assign(new Error('Insufficient available balance'), { status: 400 });
  }

  return wallet;
}

export async function releaseWithdrawalFunds(userId, amount) {
  const parsed = roundMoney(amount);
  const wallet = await Wallet.findOneAndUpdate(
    {
      userId,
      lockedBalance: { $gte: parsed },
    },
    { $inc: { lockedBalance: -parsed } },
    { new: true }
  );

  if (!wallet) {
    throw Object.assign(new Error('Wallet not found or locked balance mismatch'), { status: 404 });
  }

  return wallet;
}

export async function approveWithdrawal(withdrawal, reviewedBy) {
  if (withdrawal.status !== 'pending') {
    throw Object.assign(new Error('Withdrawal is not pending'), { status: 400 });
  }

  const parsed = roundMoney(withdrawal.amount);
  const wallet = await Wallet.findOneAndUpdate(
    {
      userId: withdrawal.userId,
      balance: { $gte: parsed },
      lockedBalance: { $gte: parsed },
    },
    {
      $inc: {
        balance: -parsed,
        lockedBalance: -parsed,
      },
    },
    { new: true }
  );

  if (!wallet) {
    throw Object.assign(new Error('Insufficient balance'), { status: 400 });
  }

  let transaction;
  if (withdrawal.transactionId) {
    transaction = await completeLinkedTransaction(withdrawal, {
      balanceAfter: wallet.balance,
      status: 'completed',
    });
  }

  if (!transaction) {
    transaction = await Transaction.create({
      userId: withdrawal.userId,
      type: 'withdrawal',
      amount: parsed,
      balanceAfter: roundMoney(wallet.balance),
      currency: withdrawal.currency || 'USDT',
      status: 'completed',
      method: withdrawal.type === 'crypto' ? 'crypto' : 'fiat',
      reference:
        withdrawal.type === 'crypto'
          ? withdrawal.walletAddress
          : withdrawal.accountNumber || String(withdrawal._id),
      withdrawalId: withdrawal._id,
      adminNote: '',
    });
    withdrawal.transactionId = transaction._id;
  }

  withdrawal.status = 'approved';
  withdrawal.reviewedBy = reviewedBy;
  withdrawal.reviewedAt = new Date();
  withdrawal.transactionId = transaction._id;
  await withdrawal.save();

  return { wallet, transaction, withdrawal };
}

export async function rejectWithdrawal(withdrawal, reviewedBy, note = '') {
  if (withdrawal.status !== 'pending') {
    throw Object.assign(new Error('Withdrawal is not pending'), { status: 400 });
  }

  await releaseWithdrawalFunds(withdrawal.userId, withdrawal.amount);
  await rejectLinkedTransaction(withdrawal, note);

  withdrawal.status = 'rejected';
  withdrawal.adminNote = note?.trim() || '';
  withdrawal.reviewedBy = reviewedBy;
  withdrawal.reviewedAt = new Date();
  await withdrawal.save();

  return withdrawal;
}
