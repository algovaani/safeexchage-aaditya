import mongoose from 'mongoose';

const futuresPositionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, index: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    marginMode: { type: String, enum: ['cross', 'isolated'], default: 'cross' },
    leverage: { type: Number, required: true, min: 1, max: 125 },
    quantity: { type: Number, required: true, min: 0 },
    entryPrice: { type: Number, required: true, min: 0 },
    markPrice: { type: Number, default: null },
    margin: { type: Number, required: true, min: 0 },
    takeProfitPrice: { type: Number, default: null },
    stopLossPrice: { type: Number, default: null },
    liquidationPrice: { type: Number, default: null },
    unrealizedPnl: { type: Number, default: 0 },
    realizedPnl: { type: Number, default: 0 },
    tradingFees: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['open', 'closed', 'liquidated'],
      default: 'open',
      index: true,
    },
    closePrice: { type: Number, default: null },
    closeReason: {
      type: String,
      enum: ['manual', 'partial', 'take_profit', 'stop_loss', 'liquidation', 'reverse', 'admin'],
      default: null,
    },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'futures_positions' }
);

futuresPositionSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const FuturesPosition = mongoose.model('FuturesPosition', futuresPositionSchema);
