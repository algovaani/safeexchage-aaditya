import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    currency: { type: String, default: 'USDT' },
    balance: { type: Number, default: 0 },
    lockedBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Wallet = mongoose.model('Wallet', walletSchema);
