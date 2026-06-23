import { Withdrawal } from '../models/Withdrawal.js';
import {
  formatWithdrawal,
  releaseWithdrawalFunds,
  reserveWithdrawalFunds,
} from '../services/withdrawalService.js';
import { error, success } from '../utils/response.js';

async function createWithdrawalRequest(req, res, next, payload) {
  const amount = payload.amount;

  try {
    await reserveWithdrawalFunds(req.userId, amount);

    let withdrawal;
    try {
      withdrawal = await Withdrawal.create({
        userId: req.userId,
        status: 'pending',
        ...payload,
      });
    } catch (createError) {
      await releaseWithdrawalFunds(req.userId, amount).catch(() => {});
      throw createError;
    }

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

  return createWithdrawalRequest(req, res, next, {
    type: 'crypto',
    amount,
    currency: String(currency || 'USDT').toUpperCase(),
    walletAddress: wallet_address.trim(),
    network: String(network).trim(),
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
