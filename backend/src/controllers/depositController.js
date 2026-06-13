import { Deposit } from '../models/Deposit.js';
import { removeFiatProof } from '../middleware/fiatDepositUpload.js';
import { formatDeposit, mapFiatProof } from '../services/depositService.js';
import { error, success } from '../utils/response.js';

export async function cryptoAddress(_req, res) {
  const address = process.env.PLATFORM_USDT_ADDRESS;
  if (!address) {
    return error(res, 'Platform USDT address is not configured', 503);
  }

  const networks = (process.env.PLATFORM_USDT_NETWORKS || 'TRC20,ERC20')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  return success(res, {
    currency: 'USDT',
    address,
    networks,
  }, 'Deposit address fetched');
}

export async function submitCrypto(req, res, next) {
  try {
    const { amount, txn_hash, network } = req.body;

    const duplicate = await Deposit.findOne({
      txnHash: txn_hash.trim(),
      status: { $in: ['pending', 'approved'] },
    });
    if (duplicate) {
      return error(res, 'This transaction hash was already submitted', 409);
    }

    const deposit = await Deposit.create({
      userId: req.userId,
      type: 'crypto',
      amount,
      currency: 'USDT',
      txnHash: txn_hash.trim(),
      network,
      status: 'pending',
    });

    return success(res, formatDeposit(req, deposit), 'Crypto deposit submitted for verification', 201);
  } catch (e) {
    return next(e);
  }
}

export async function submitFiat(req, res, next) {
  try {
    const { amount, utr_number } = req.body;

    if (!req.file) {
      return error(res, 'payment_proof file is required', 400);
    }

    const paymentProof = mapFiatProof(req.file);

    const deposit = await Deposit.create({
      userId: req.userId,
      type: 'fiat',
      amount,
      currency: 'USDT',
      utrNumber: utr_number?.trim() || '',
      paymentProof,
      status: 'pending',
    });

    return success(res, formatDeposit(req, deposit), 'Fiat deposit submitted for verification', 201);
  } catch (e) {
    removeFiatProof(req.file);
    return next(e);
  }
}

export async function history(req, res, next) {
  try {
    const { status, type } = req.query;
    const filter = { userId: req.userId };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const rows = await Deposit.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const data = rows.map((row) => formatDeposit(req, row));
    return success(res, data, 'Deposit history fetched');
  } catch (e) {
    return next(e);
  }
}
