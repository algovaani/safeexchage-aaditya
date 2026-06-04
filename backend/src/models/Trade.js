import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, uppercase: true, index: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    buyerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    buyOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    sellOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    fee: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Trade = mongoose.model('Trade', tradeSchema);
