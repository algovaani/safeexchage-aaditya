import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { success } from '../utils/response.js';
import { listUserAssets } from '../services/assetBalanceService.js';
import { formatWalletSnapshot, enrichWalletSnapshotWithPrices } from '../services/walletAdjustmentService.js';
import { fetchPriceMap } from '../services/marketDataProvider.js';

export async function balance(req, res, next) {
  try {
    const [w, assets, priceData] = await Promise.all([
      Wallet.findOne({ userId: req.userId }).lean(),
      listUserAssets(req.userId),
      fetchPriceMap().catch(() => ({ prices: {} })),
    ]);
    const snapshot = formatWalletSnapshot(w, assets);
    enrichWalletSnapshotWithPrices(snapshot, priceData?.prices || {});
    return success(res, snapshot, 'Wallet balance fetched');
  } catch (e) {
    return next(e);
  }
}

export async function deposit(req, res, next) {
  try {
    const { amount, reference } = req.body;
    const tx = await Transaction.create({
      userId: req.userId,
      type: 'deposit',
      amount,
      status: 'pending',
      method: 'manual',
      reference: reference || '',
    });
    return success(res, tx, 'Deposit request submitted', 201);
  } catch (e) {
    return next(e);
  }
}

export async function withdraw(req, res, next) {
  try {
    const { amount } = req.body;
    const tx = await Transaction.create({
      userId: req.userId,
      type: 'withdrawal',
      amount,
      status: 'pending',
      method: 'manual',
    });
    return success(res, tx, 'Withdrawal request submitted', 201);
  } catch (e) {
    return next(e);
  }
}

export async function transactions(req, res, next) {
  try {
    const list = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
    return success(res, list, 'Transactions fetched');
  } catch (e) {
    return next(e);
  }
}
