import mongoose from 'mongoose';

const manualPriceSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, uppercase: true },
    interval: { type: String, required: true },
    openTime: { type: Number, required: true },
    mode: { type: String, enum: ['candle', 'tick'], default: 'candle' },
    open: { type: Number },
    high: { type: Number },
    low: { type: Number },
    close: { type: Number },
    volume: { type: Number, default: 0 },
    tickTime: { type: Number },
    price: { type: Number },
    revision: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

manualPriceSchema.index({ symbol: 1, interval: 1, openTime: 1 });

export const ManualPriceData = mongoose.model('ManualPriceData', manualPriceSchema);
