import mongoose from 'mongoose';

const futuresSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'futures', unique: true },
    enabled: { type: Boolean, default: true },
    maxLeverage: { type: Number, default: 125, min: 1, max: 125 },
    minLeverage: { type: Number, default: 1, min: 1 },
    defaultLeverage: { type: Number, default: 20 },
    defaultMarginMode: { type: String, enum: ['cross', 'isolated'], default: 'cross' },
    takerFeeRate: { type: Number, default: 0.0004 },
    makerFeeRate: { type: Number, default: 0.0002 },
    maintenanceMarginRate: { type: Number, default: 0.004 },
    minOrderNotional: { type: Number, default: 5 },
    maxOrderNotional: { type: Number, default: 5_000_000 },
    minQuantity: { type: Number, default: 0.001 },
    fundingEnabled: { type: Boolean, default: false },
    fundingRate: { type: Number, default: 0.0001 },
    fundingIntervalHours: { type: Number, default: 8 },
    allowedLeverages: {
      type: [Number],
      default: [1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125],
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'futures_settings' }
);

export const FuturesSettings = mongoose.model('FuturesSettings', futuresSettingsSchema);
