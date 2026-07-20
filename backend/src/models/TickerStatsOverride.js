import mongoose from 'mongoose';

const tickerStatsOverrideSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    change_24h: { type: Number, default: null },
    high_24h: { type: Number, default: null },
    low_24h: { type: Number, default: null },
    volume: { type: Number, default: null },
    quoteVolume: { type: Number, default: null },
    enabled: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'ticker_stats_overrides' }
);

export const TickerStatsOverride = mongoose.model('TickerStatsOverride', tickerStatsOverrideSchema);
