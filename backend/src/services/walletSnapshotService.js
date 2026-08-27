import { Wallet } from '../models/Wallet.js';
import { listUserAssets } from './assetBalanceService.js';
import { formatWalletSnapshot } from './walletAdjustmentService.js';
import { ensureWalletBuckets } from './walletBucketService.js';

/** Fresh wallet snapshot for API + socket pushes (repairs legacy buckets when needed). */
export async function fetchWalletSnapshotForUser(userId) {
  const wallet = await Wallet.findOne({ userId });
  if (wallet) {
    const prev = {
      main: wallet.mainBalance || 0,
      referral: wallet.referralBalance || 0,
      bonus: wallet.bonusBalance || 0,
    };
    ensureWalletBuckets(wallet);
    if (
      prev.main !== wallet.mainBalance ||
      prev.referral !== wallet.referralBalance ||
      prev.bonus !== wallet.bonusBalance
    ) {
      await wallet.save();
    }
  }
  const assets = await listUserAssets(userId);
  return formatWalletSnapshot(wallet, assets);
}
