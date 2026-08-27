import { AssetBalance } from '../models/AssetBalance.js';
import { Order } from '../models/Order.js';
import { getPairSync } from './tradingPairService.js';
import { storeMoney } from '../utils/money.js';

export function baseAssetFromSymbol(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const pair = getPairSync(sym);
  if (pair?.baseAsset) return pair.baseAsset;
  if (sym.endsWith('USDT')) return sym.slice(0, -4);
  if (sym.endsWith('INR')) return sym.slice(0, -3);
  return sym;
}

export async function getAssetBalance(userId, asset) {
  const row = await AssetBalance.findOne({ userId, asset: asset.toUpperCase() }).lean();
  return row?.balance || 0;
}

export async function getAvailableAssetBalance(userId, asset) {
  const row = await AssetBalance.findOne({ userId, asset: asset.toUpperCase() }).lean();
  return (row?.balance || 0) - (row?.lockedBalance || 0);
}

export async function listUserAssets(userId) {
  const rows = await AssetBalance.find({
    userId,
    $or: [{ balance: { $gt: 0 } }, { lockedBalance: { $gt: 0 } }],
  })
    .sort({ asset: 1 })
    .lean();
  return rows.map((r) => ({
    asset: r.asset,
    balance: storeMoney(r.balance),
    locked_balance: storeMoney(r.lockedBalance || 0),
  }));
}

export async function creditAsset(userId, asset, quantity) {
  const qty = storeMoney(quantity);
  if (qty <= 0) return null;

  const row = await AssetBalance.findOneAndUpdate(
    { userId, asset: asset.toUpperCase() },
    { $inc: { balance: qty }, $setOnInsert: { userId, asset: asset.toUpperCase() } },
    { upsert: true, new: true }
  );
  row.balance = storeMoney(row.balance);
  await row.save();
  return row;
}

export async function debitAsset(userId, asset, quantity) {
  const qty = storeMoney(quantity);
  if (qty <= 0) return null;

  const available = await getAvailableAssetBalance(userId, asset);
  if (available + 1e-10 < qty) {
    throw Object.assign(new Error('Insufficient asset balance'), { status: 400 });
  }

  const row = await AssetBalance.findOneAndUpdate(
    { userId, asset: asset.toUpperCase() },
    { $inc: { balance: -qty } },
    { new: true }
  );
  if (!row) {
    throw Object.assign(new Error('Insufficient asset balance'), { status: 400 });
  }
  row.balance = storeMoney(row.balance);
  await row.save();
  return row;
}

/** Reserve base asset for an open sell order. */
export async function lockAsset(userId, asset, quantity) {
  const qty = storeMoney(quantity);
  if (qty <= 0) return null;

  const available = await getAvailableAssetBalance(userId, asset);
  if (available + 1e-10 < qty) {
    throw Object.assign(new Error('Insufficient asset balance'), { status: 400 });
  }

  const row = await AssetBalance.findOneAndUpdate(
    { userId, asset: asset.toUpperCase() },
    { $inc: { lockedBalance: qty }, $setOnInsert: { userId, asset: asset.toUpperCase() } },
    { upsert: true, new: true }
  );
  row.lockedBalance = storeMoney(row.lockedBalance || 0);
  await row.save();
  return row;
}

/** Release reserved base asset when a sell order is cancelled or rejected. */
export async function unlockAsset(userId, asset, quantity) {
  const qty = storeMoney(quantity);
  if (qty <= 0) return null;

  const row = await AssetBalance.findOne({ userId, asset: asset.toUpperCase() });
  if (!row) return null;

  const release = Math.min(qty, storeMoney(row.lockedBalance || 0));
  if (release <= 0) return row;

  row.lockedBalance = storeMoney(Math.max(0, (row.lockedBalance || 0) - release));
  await row.save();
  return row;
}

/**
 * Align locked base asset with open sell orders (fixes stuck locks after partial deploy / rejects).
 */
export async function reconcileSellAssetLocks(userId, asset) {
  const assetUpper = String(asset || '').toUpperCase();
  if (!assetUpper) return null;

  const openSells = await Order.find({
    userId,
    side: 'sell',
    status: { $in: ['open', 'partially_filled'] },
  })
    .select('symbol quantity filledQuantity')
    .lean();

  let needed = 0;
  for (const o of openSells) {
    if (baseAssetFromSymbol(o.symbol) !== assetUpper) continue;
    needed += storeMoney((o.quantity || 0) - (o.filledQuantity || 0));
  }
  needed = storeMoney(needed);

  const row = await AssetBalance.findOne({ userId, asset: assetUpper });
  if (!row) return null;

  const balance = storeMoney(row.balance || 0);
  const correctLock = storeMoney(Math.min(needed, balance));
  const currentLock = storeMoney(row.lockedBalance || 0);

  if (currentLock !== correctLock) {
    row.lockedBalance = correctLock;
    await row.save();
  }
  return row;
}

/** Settle a filled sell — debit balance and release any matching locked amount. */
export async function debitLockedAsset(userId, asset, quantity) {
  const qty = storeMoney(quantity);
  if (qty <= 0) return null;

  const row = await AssetBalance.findOne({ userId, asset: asset.toUpperCase() });
  if (!row || (row.balance || 0) + 1e-10 < qty) {
    throw Object.assign(new Error('Insufficient asset balance'), { status: 400 });
  }

  const locked = storeMoney(row.lockedBalance || 0);
  const fromLocked = Math.min(qty, locked);
  row.balance = storeMoney(row.balance - qty);
  row.lockedBalance = storeMoney(Math.max(0, locked - fromLocked));
  await row.save();
  return row;
}
