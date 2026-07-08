import mongoose from 'mongoose';

const futuresOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    positionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FuturesPosition', default: null, index: true },
    symbol: { type: String, required: true, uppercase: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    orderType: { type: String, enum: ['market', 'limit'], default: 'market' },
    action: {
      type: String,
      enum: [
        'open',
        'close',
        'partial_close',
        'add_margin',
        'reduce_margin',
        'reverse',
        'take_profit',
        'stop_loss',
        'liquidation',
      ],
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    leverage: { type: Number, default: 1 },
    marginMode: { type: String, enum: ['cross', 'isolated'], default: 'cross' },
    marginDelta: { type: Number, default: 0 },
    fee: { type: Number, default: 0 },
    pnl: { type: Number, default: 0 },
    status: { type: String, enum: ['filled', 'rejected', 'cancelled'], default: 'filled', index: true },
    note: { type: String, default: '' },
  },
  { timestamps: true, collection: 'futures_orders' }
);

futuresOrderSchema.index({ createdAt: -1 });

export const FuturesOrder = mongoose.model('FuturesOrder', futuresOrderSchema);
