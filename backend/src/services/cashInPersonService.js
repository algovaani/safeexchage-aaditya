import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { roundMoney } from '../utils/money.js';
import { emitWalletUpdate } from './socketService.js';

export function formatCashInPersonRequest(doc, { includeUser = false } = {}) {
  const payload = {
    id: doc._id,
    userId: doc.userId?._id || doc.userId,
    mobile: doc.mobile,
    city: doc.city,
    requestedAmount: doc.requestedAmount ?? null,
    creditedAmount: doc.creditedAmount ?? null,
    currency: doc.currency || 'USDT',
    status: doc.status,
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

export async function approveCashInPersonRequest(request, reviewedBy, amount, io) {
  if (request.status !== 'pending') {
    throw Object.assign(new Error('Only pending requests can be approved'), { status: 400 });
  }

  const creditAmount = roundMoney(Number(amount));
  if (!(creditAmount > 0)) {
    throw Object.assign(new Error('A valid credit amount is required'), { status: 400 });
  }

  const wallet = await Wallet.findOneAndUpdate(
    { userId: request.userId },
    { $inc: { balance: creditAmount }, $setOnInsert: { currency: 'USDT' } },
    { upsert: true, new: true }
  );

  const transaction = await Transaction.create({
    userId: request.userId,
    type: 'deposit',
    amount: creditAmount,
    balanceAfter: roundMoney(wallet.balance),
    currency: 'USDT',
    status: 'completed',
    method: 'fiat',
    reference: `Cash in person — ${request.city}`,
    adminNote: request.adminNote || '',
  });

  request.status = 'approved';
  request.creditedAmount = creditAmount;
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date();
  request.transactionId = transaction._id;
  await request.save();

  if (io) {
    await emitWalletUpdate(io, request.userId, { reason: 'cash_in_person_approved' });
  }

  return { request, wallet, transaction };
}

export async function rejectCashInPersonRequest(request, reviewedBy, note = '') {
  if (request.status !== 'pending') {
    throw Object.assign(new Error('Only pending requests can be rejected'), { status: 400 });
  }

  request.status = 'rejected';
  request.adminNote = note?.trim() || '';
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date();
  await request.save();

  return request;
}
