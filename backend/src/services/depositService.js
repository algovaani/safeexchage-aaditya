import path from 'path';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { storedFiatProofPath } from '../middleware/fiatDepositUpload.js';
import { toPublicFileUrl } from '../utils/fileUrl.js';
import { roundMoney } from '../utils/money.js';
import {
  computeDepositUsdtCredit,
  depositCreditReference,
} from './depositConversionService.js';
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

  const conversion = await computeDepositUsdtCredit(deposit);
  deposit.usdtAmount = conversion.usdtAmount;
  deposit.conversionRate = conversion.conversionRate;

  const wallet = await Wallet.findOneAndUpdate(
    { userId: deposit.userId },
    { $inc: { balance: conversion.usdtAmount }, $setOnInsert: { currency: 'USDT' } },
    { upsert: true, new: true }
  );

  const creditReference = depositCreditReference(deposit);

  let transaction;
  if (deposit.transactionId) {
    transaction = await completeLinkedTransaction(deposit, {
      balanceAfter: wallet.balance,
      status: 'completed',
      amount: conversion.usdtAmount,
      currency: 'USDT',
      reference: creditReference,
    });
  }

  if (!transaction) {
    transaction = await Transaction.create({
      userId: deposit.userId,
      type: 'deposit',
      amount: conversion.usdtAmount,
      balanceAfter: roundMoney(wallet.balance),
      currency: 'USDT',
      status: 'completed',
      method: deposit.type === 'crypto' ? 'crypto' : 'fiat',
      reference: creditReference,
      depositId: deposit._id,
      adminNote: '',
    });
    deposit.transactionId = transaction._id;
  }

  deposit.status = 'approved';
  deposit.reviewedBy = reviewedBy;
  deposit.reviewedAt = new Date();
  if (deposit.type === 'crypto') {
    const settings = await getPlatformSettings();
    deposit.treasuryStatus = isManualDepositMode(settings) ? 'not_applicable' : 'pending_sweep';
    if (!deposit.chain) {
      deposit.chain = normalizeChainFromNetwork(deposit.network) || '';
    }
  }
  if (!deposit.transactionId) {
    deposit.transactionId = transaction._id;
  }
  await deposit.save();

  return { wallet, transaction, deposit };
}

/** Reject deposit and reverse wallet credit if it was approved/auto-credited. */
export async function rejectDepositWithReversal(deposit, reviewedBy, note = '') {
  const wasApproved = deposit.status === 'approved';

  if (wasApproved) {
    const usdtAmount = deposit.usdtAmount ?? deposit.amount;
    const wallet = await Wallet.findOne({ userId: deposit.userId });
    if (wallet) {
      const debit = Math.min(wallet.balance, usdtAmount);
      if (debit > 0) {
        wallet.balance = roundMoney(wallet.balance - debit);
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
