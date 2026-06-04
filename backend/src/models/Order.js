import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true, uppercase: true },
    side: { type: String, enum: ['buy', 'sell'], required: true },
    orderType: { type: String, enum: ['market', 'limit'], required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, default: null },
    stopLoss: { type: Number, default: null },
    takeProfit: { type: Number, default: null },
    status: {
      type: String,
      enum: ['open', 'partially_filled', 'filled', 'cancelled', 'rejected'],
      default: 'open',
    },
    filledQuantity: { type: Number, default: 0 },
    avgFillPrice: { type: Number, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ symbol: 1, status: 1 });

export const Order = mongoose.model('Order', orderSchema);
