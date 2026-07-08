import { FuturesSettings } from '../models/FuturesSettings.js';

const DEFAULTS = {
  key: 'futures',
  enabled: true,
  maxLeverage: 125,
  minLeverage: 1,
  defaultLeverage: 20,
  defaultMarginMode: 'cross',
  takerFeeRate: 0.0004,
  makerFeeRate: 0.0002,
  maintenanceMarginRate: 0.004,
  minOrderNotional: 5,
  maxOrderNotional: 5_000_000,
  minQuantity: 0.001,
  fundingEnabled: false,
  fundingRate: 0.0001,
  fundingIntervalHours: 8,
  allowedLeverages: [1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125],
};

let cache = null;
let cacheAt = 0;
const TTL_MS = 15_000;

export async function getFuturesSettings({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < TTL_MS) return cache;

  let doc = await FuturesSettings.findOne({ key: 'futures' }).lean();
  if (!doc) {
    doc = (await FuturesSettings.create(DEFAULTS)).toObject();
  }

  cache = { ...DEFAULTS, ...doc, id: String(doc._id) };
  cacheAt = Date.now();
  return cache;
}

export function invalidateFuturesSettingsCache() {
  cache = null;
  cacheAt = 0;
}

export async function updateFuturesSettings(payload, adminId) {
  const update = { ...payload, updatedBy: adminId || null };
  delete update.id;
  delete update._id;
  delete update.key;

  const doc = await FuturesSettings.findOneAndUpdate(
    { key: 'futures' },
    { $set: update, $setOnInsert: { key: 'futures' } },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  invalidateFuturesSettingsCache();
  return { ...DEFAULTS, ...doc, id: String(doc._id) };
}

export function publicFuturesConfig(settings) {
  return {
    enabled: settings.enabled,
    maxLeverage: settings.maxLeverage,
    minLeverage: settings.minLeverage,
    defaultLeverage: settings.defaultLeverage,
    defaultMarginMode: settings.defaultMarginMode,
    takerFeeRate: settings.takerFeeRate,
    makerFeeRate: settings.makerFeeRate,
    maintenanceMarginRate: settings.maintenanceMarginRate,
    minOrderNotional: settings.minOrderNotional,
    maxOrderNotional: settings.maxOrderNotional,
    minQuantity: settings.minQuantity,
    fundingEnabled: settings.fundingEnabled,
    fundingRate: settings.fundingRate,
    allowedLeverages: settings.allowedLeverages,
  };
}
