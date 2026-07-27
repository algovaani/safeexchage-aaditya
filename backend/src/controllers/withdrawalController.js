import { Withdrawal } from '../models/Withdrawal.js';
import {
  cancelWithdrawal,
  formatWithdrawal,
  releaseWithdrawalFunds,
  reserveWithdrawalFunds,
} from '../services/withdrawalService.js';
import { createPendingWithdrawalTransaction } from '../services/transactionService.js';
import { notifyWithdrawalRequest, resolveNotificationsForRef } from '../services/adminNotificationService.js';
import { roundMoney } from '../utils/money.js';
import { error, success } from '../utils/response.js';

async function createWithdrawalRequest(req, res, next, payload) {
  const parsedAmount = roundMoney(payload.amount);
  if (!(parsedAmount > 0)) {
    return error(res, 'Invalid withdrawal amount', 400);
  }

  try {
    await reserveWithdrawalFunds(req.userId, parsedAmount);

    let withdrawal;
    try {
      withdrawal = await Withdrawal.create({
        userId: req.userId,
        status: 'pending',
        ...payload,
        amount: parsedAmount,
      });
      await createPendingWithdrawalTransaction(withdrawal);
    } catch (createError) {
      await releaseWithdrawalFunds(req.userId, parsedAmount).catch(() => {});
      throw createError;
    }

    void notifyWithdrawalRequest(req.app.get('io'), withdrawal);

    const message =
      payload.type === 'fiat'
        ? 'Fiat withdrawal submitted for verification'
        : 'Crypto withdrawal submitted for verification';

    return success(res, formatWithdrawal(req, withdrawal), message, 201);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function submitCrypto(req, res, next) {
  const { amount, wallet_address, network, currency } = req.body;
  const walletAddress = String(wallet_address || '').trim();
  const networkStr = String(network || '').trim();

  if (!walletAddress) {
    return error(res, 'wallet_address is required', 400);
  }
  if (!networkStr) {
    return error(res, 'network is required', 400);
  }

  return createWithdrawalRequest(req, res, next, {
    type: 'crypto',
    amount,
    currency: String(currency || 'USDT').toUpperCase(),
    walletAddress,
    network: networkStr,
  });
}

export async function submitFiat(req, res, next) {
  const { amount, bank_name, account_number, ifsc, account_holder } = req.body;

  return createWithdrawalRequest(req, res, next, {
    type: 'fiat',
    amount,
    currency: 'INR',
    bankName: bank_name.trim(),
    accountNumber: account_number.trim(),
    ifsc: ifsc.trim(),
    accountHolder: account_holder.trim(),
  });
}

export async function history(req, res, next) {
  try {
    const { status, type } = req.query;
    const filter = { userId: req.userId };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const rows = await Withdrawal.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const data = rows.map((row) => formatWithdrawal(req, row));
    return success(res, data, 'Withdrawal history fetched');
  } catch (e) {
    return next(e);
  }
}

export async function cancel(req, res, next) {
  try {
    const withdrawal = await Withdrawal.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!withdrawal) {
      return error(res, 'Withdrawal not found', 404);
    }

    const updated = await cancelWithdrawal(withdrawal);
    void resolveNotificationsForRef(req.app.get('io'), 'withdrawal', withdrawal._id);
    return success(res, formatWithdrawal(req, updated), 'Withdrawal cancelled');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}
