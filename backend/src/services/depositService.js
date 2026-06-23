import path from 'path';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { storedFiatProofPath } from '../middleware/fiatDepositUpload.js';
import { toPublicFileUrl } from '../utils/fileUrl.js';

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
    status: doc.status,
    txnHash: doc.txnHash || null,
    network: doc.network || null,
    utrNumber: doc.utrNumber || null,
    bankName: doc.bankName || null,
    accountNumber: doc.accountNumber || null,
    paymentProof,
    adminNote: doc.adminNote || '',
    transactionId: doc.transactionId || null,
    submittedAt: doc.createdAt,
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

export async function creditWalletForDeposit(deposit, reviewedBy) {
  if (deposit.status !== 'pending') {
    throw Object.assign(new Error('Deposit is not pending'), { status: 400 });
  }

  const wallet = await Wallet.findOneAndUpdate(
    { userId: deposit.userId },
    { $inc: { balance: deposit.amount }, $setOnInsert: { currency: 'USDT' } },
    { upsert: true, new: true }
  );

  const transaction = await Transaction.create({
    userId: deposit.userId,
    type: 'deposit',
    amount: deposit.amount,
    currency: deposit.currency || 'USDT',
    status: 'completed',
    method: deposit.type === 'crypto' ? 'crypto' : 'fiat',
    reference: deposit.txnHash || deposit.utrNumber || String(deposit._id),
    depositId: deposit._id,
    adminNote: '',
  });

  deposit.status = 'approved';
  deposit.reviewedBy = reviewedBy;
  deposit.reviewedAt = new Date();
  deposit.transactionId = transaction._id;
  await deposit.save();

  return { wallet, transaction, deposit };
}
