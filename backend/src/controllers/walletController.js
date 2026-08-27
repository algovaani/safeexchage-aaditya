import { Transaction } from '../models/Transaction.js';
import { success, error } from '../utils/response.js';
import { enrichWalletSnapshotWithPrices } from '../services/walletAdjustmentService.js';
import { fetchWalletSnapshotForUser } from '../services/walletSnapshotService.js';
import { fetchPriceMap } from '../services/marketDataProvider.js';

export async function balance(req, res, next) {
  try {
    const [snapshot, priceData] = await Promise.all([
      fetchWalletSnapshotForUser(req.userId),
      fetchPriceMap().catch(() => ({ prices: {} })),
    ]);
    enrichWalletSnapshotWithPrices(snapshot, priceData?.prices || {});
    return success(res, snapshot, 'Wallet balance fetched');
  } catch (e) {
    return next(e);
  }
}

/** @deprecated Removed — use /api/deposit/* flow. Blocks direct API abuse. */
export async function deposit(_req, res) {
  return error(
    res,
    'This endpoint is disabled. Use Deposit → Crypto/Fiat submit instead.',
    410
  );
}

/** @deprecated Removed — use /api/withdrawal/* flow. Blocks zero-balance withdraw spam. */
export async function withdraw(_req, res) {
  return error(
    res,
    'This endpoint is disabled. Use Withdraw → Crypto/Fiat submit instead.',
    410
  );
}

export async function transactions(req, res, next) {
  try {
    const list = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
    return success(res, list, 'Transactions fetched');
  } catch (e) {
    return next(e);
  }
}
