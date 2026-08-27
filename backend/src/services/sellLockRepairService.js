import { AssetBalance } from '../models/AssetBalance.js';
import { Order } from '../models/Order.js';
import { storeMoney } from '../utils/money.js';
import { baseAssetFromSymbol, reconcileSellAssetLocks } from './assetBalanceService.js';

/** Startup / repair pass for production rows with orphaned lockedBalance. */
export async function reconcileAllSellAssetLocks() {
  const openSells = await Order.find({
    side: 'sell',
    status: { $in: ['open', 'partially_filled'] },
  })
    .select('userId symbol')
    .lean();

  const keys = new Set();
  for (const o of openSells) {
    keys.add(`${String(o.userId)}:${baseAssetFromSymbol(o.symbol)}`);
  }

  const stuckRows = await AssetBalance.find({ lockedBalance: { $gt: 0 } })
    .select('userId asset')
    .lean();
  for (const r of stuckRows) {
    keys.add(`${String(r.userId)}:${r.asset}`);
  }

  let fixed = 0;
  for (const key of keys) {
    const sep = key.indexOf(':');
    const userId = key.slice(0, sep);
    const asset = key.slice(sep + 1);
    const before = await AssetBalance.findOne({ userId, asset }).lean();
    await reconcileSellAssetLocks(userId, asset);
    const after = await AssetBalance.findOne({ userId, asset }).lean();
    if (storeMoney(before?.lockedBalance || 0) !== storeMoney(after?.lockedBalance || 0)) {
      fixed += 1;
    }
  }

  return { fixed, openSellOrders: openSells.length };
}
