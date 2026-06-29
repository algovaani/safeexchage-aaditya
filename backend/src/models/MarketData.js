import mongoose from 'mongoose';

/** Cached CoinGecko OHLCV per bucket */
const marketDataSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, uppercase: true },
    interval: { type: String, required: true },
    openTime: { type: Number, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, default: 0 },
    isFinal: { type: Boolean, default: false },
    source: { type: String, default: 'coingecko' },
  },
  { timestamps: true }
);

marketDataSchema.index({ symbol: 1, interval: 1, openTime: 1 }, { unique: true });

export const MarketData = mongoose.model('MarketData', marketDataSchema);
