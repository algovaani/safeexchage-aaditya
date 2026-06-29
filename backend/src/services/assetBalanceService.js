import { AssetBalance } from '../models/AssetBalance.js';
import { TRADING_PAIRS } from '../config/tradingPairs.js';
import { storeMoney } from '../utils/money.js';

export function baseAssetFromSymbol(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const pair = TRADING_PAIRS.find((p) => p.symbol === sym);
  if (pair) return pair.baseAsset;
  if (sym.endsWith('USDT')) return sym.slice(0, -4);
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
  const rows = await AssetBalance.find({ userId, balance: { $gt: 0 } })
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
