import { Wallet } from '../models/Wallet.js';
import { listUserAssets } from './assetBalanceService.js';
import { formatWalletSnapshot } from './walletAdjustmentService.js';
import { ensureWalletBuckets } from './walletBucketService.js';

/** Wallet buckets only — skips asset list (fast path for trade API). */
export function formatWalletSnapshotLight(wallet) {
  if (!wallet) return formatWalletSnapshot(null, []);
  ensureWalletBuckets(wallet);
  return formatWalletSnapshot(wallet, []);
}

/** Fresh wallet snapshot for API + socket pushes (repairs legacy buckets when needed). */
export async function fetchWalletSnapshotForUser(userId, { includeAssets = true } = {}) {
  const wallet = await Wallet.findOne({ userId });
  if (wallet) {
    const prev = {
      main: wallet.mainBalance || 0,
      referral: wallet.referralBalance || 0,
      bonus: wallet.bonusBalance || 0,
    };
    ensureWalletBuckets(wallet);
    if (
      includeAssets &&
      (prev.main !== wallet.mainBalance ||
        prev.referral !== wallet.referralBalance ||
        prev.bonus !== wallet.bonusBalance)
    ) {
      await wallet.save();
    }
  }
  if (!includeAssets) return formatWalletSnapshotLight(wallet);
  const assets = await listUserAssets(userId);
  return formatWalletSnapshot(wallet, assets);
}
