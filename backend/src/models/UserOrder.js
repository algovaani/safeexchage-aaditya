import mongoose from 'mongoose';

const userOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminTrade', required: true, index: true },
    marginAmount: { type: Number, required: true, min: 0 },
    entryPrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['open', 'closed', 'cancelled'],
      default: 'open',
      index: true,
    },
    pnl: { type: Number, default: 0 },
    closePrice: { type: Number, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'user_orders' }
);

userOrderSchema.index({ tradeId: 1, status: 1 });
userOrderSchema.index({ userId: 1, tradeId: 1, status: 1 });

export const UserOrder = mongoose.model('UserOrder', userOrderSchema);
