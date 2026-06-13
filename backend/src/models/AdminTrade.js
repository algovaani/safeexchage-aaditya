import mongoose from 'mongoose';

const adminTradeSchema = new mongoose.Schema(
  {
    pairId: { type: mongoose.Schema.Types.ObjectId, ref: 'TradingPair', required: true, index: true },
    entryPrice: { type: Number, required: true, min: 0 },
    takeProfit: { type: Number, required: true, min: 0 },
    stopLoss: { type: Number, required: true, min: 0 },
    leverage: { type: Number, required: true, min: 1, max: 100 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['open', 'closed', 'cancelled'],
      default: 'open',
      index: true,
    },
    closePrice: { type: Number, default: null },
    closedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'admin_trades' }
);

export const AdminTrade = mongoose.model('AdminTrade', adminTradeSchema);
