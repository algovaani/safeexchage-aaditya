import { Deposit } from '../models/Deposit.js';
import { TreasuryWithdrawal } from '../models/TreasuryWithdrawal.js';
import { roundMoney } from '../utils/money.js';

export function defaultAdminWalletAddress() {
  return (
    process.env.ADMIN_WALLET_ADDRESS ||
    process.env.ADMIN_CRYPTO_WALLET ||
    process.env.PLATFORM_USDT_ADDRESS ||
    ''
  ).trim();
}

export function defaultPlatformAddress() {
  return (process.env.PLATFORM_USDT_ADDRESS || '').trim();
}

export function canTreasuryWithdraw(deposit) {
  if (!deposit || deposit.type !== 'crypto' || deposit.status !== 'approved') return false;
  return deposit.treasuryStatus !== 'swept';
}

export function formatTreasuryWithdrawal(doc, { includeUser = false, includeDeposit = false } = {}) {
  const payload = {
    id: doc._id,
    depositId: doc.depositId?._id || doc.depositId,
    userId: doc.userId?._id || doc.userId,
    amount: doc.amount,
    currency: doc.currency || 'USDT',
    usdtAmount: doc.usdtAmount != null ? roundMoney(doc.usdtAmount) : null,
    network: doc.network || '',
    userTxnHash: doc.userTxnHash || '',
    platformAddress: doc.platformAddress || '',
    fromAddress: doc.fromAddress || doc.platformAddress || '',
    gasTxHash: doc.gasTxHash || '',
    sweepMode: doc.sweepMode || 'manual',
    sweptAmount: doc.sweptAmount != null ? roundMoney(doc.sweptAmount) : null,
    sweptCurrency: doc.sweptCurrency || doc.currency || 'USDT',
    adminWalletAddress: doc.adminWalletAddress,
    outboundTxnHash: doc.outboundTxnHash || '',
    status: doc.status,
    notes: doc.notes || '',
    createdAt: doc.createdAt,
    completedAt: doc.completedAt || null,
  };

  if (includeUser && doc.userId && typeof doc.userId === 'object') {
    payload.user = {
      id: doc.userId._id,
      email: doc.userId.email || null,
      mobile: doc.userId.mobile || null,
      name: doc.userId.name || '',
    };
    payload.userLabel = payload.user.email || payload.user.mobile || String(payload.userId);
  }

  if (includeDeposit && doc.depositId && typeof doc.depositId === 'object') {
    payload.deposit = {
      id: doc.depositId._id,
      amount: doc.depositId.amount,
      currency: doc.depositId.currency,
      txnHash: doc.depositId.txnHash,
      network: doc.depositId.network,
    };
  }

  return payload;
}

export async function createTreasuryWithdrawalFromDeposit(deposit, adminUserId, body) {
  if (!canTreasuryWithdraw(deposit)) {
    throw Object.assign(new Error('This deposit is not available for treasury withdrawal'), { status: 400 });
  }

  const existing = await TreasuryWithdrawal.findOne({ depositId: deposit._id }).lean();
  if (existing) {
    throw Object.assign(new Error('Treasury withdrawal already recorded for this deposit'), { status: 409 });
  }

  const adminWalletAddress = String(body.admin_wallet_address || body.adminWalletAddress || '').trim();
  const outboundTxnHash = String(body.outbound_txn_hash || body.outboundTxnHash || '').trim();
  const notes = String(body.notes || '').trim();
  const fromAddress = String(body.from_address || body.fromAddress || '').trim();
  const platformAddress = String(body.platform_address || body.platformAddress || fromAddress || defaultPlatformAddress()).trim();
  const gasTxHash = String(body.gas_tx_hash || body.gasTxHash || '').trim();
  const sweepMode = body.sweep_mode === 'auto' || body.sweepMode === 'auto' ? 'auto' : 'manual';
  const sweptAmount = body.swept_amount != null ? roundMoney(body.swept_amount) : body.sweptAmount != null ? roundMoney(body.sweptAmount) : null;

  if (!adminWalletAddress) {
    throw Object.assign(new Error('admin_wallet_address is required'), { status: 400 });
  }
  if (!outboundTxnHash) {
    throw Object.assign(new Error('outbound_txn_hash is required (your on-chain transfer to admin wallet)'), {
      status: 400,
    });
  }

  const treasuryWithdrawal = await TreasuryWithdrawal.create({
    depositId: deposit._id,
    userId: deposit.userId,
    amount: sweptAmount ?? deposit.amount,
    currency: deposit.currency || 'USDT',
    usdtAmount: deposit.usdtAmount,
    network: deposit.network || '',
    userTxnHash: deposit.txnHash || '',
    platformAddress,
    fromAddress: fromAddress || platformAddress,
    gasTxHash,
    sweepMode,
    sweptAmount,
    sweptCurrency: body.swept_currency || deposit.currency || 'USDT',
    adminWalletAddress,
    outboundTxnHash,
    status: 'completed',
    notes,
    createdBy: adminUserId,
    completedBy: adminUserId,
    completedAt: new Date(),
  });

  deposit.treasuryStatus = 'swept';
  deposit.treasuryWithdrawalId = treasuryWithdrawal._id;
  await deposit.save();

  return treasuryWithdrawal;
}
