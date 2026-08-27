import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    currency: { type: String, default: 'USDT' },
    balance: { type: Number, default: 0, min: 0 },
    lockedBalance: { type: Number, default: 0, min: 0 },
    /** Main wallet — trade, stake, withdraw. */
    mainBalance: { type: Number, default: 0, min: 0 },
    /** Referral wallet — trade only; profits go to main. */
    referralBalance: { type: Number, default: 0, min: 0 },
    /** Bonus wallet — trade only; profits go to main. */
    bonusBalance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const Wallet = mongoose.model('Wallet', walletSchema);
