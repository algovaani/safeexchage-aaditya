import mongoose from 'mongoose';

const tradingPairSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    baseAsset: { type: String, required: true, uppercase: true },
    quoteAsset: { type: String, required: true, uppercase: true, default: 'USDT' },
    displayPair: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'trading_pairs' }
);

export const TradingPair = mongoose.model('TradingPair', tradingPairSchema);
