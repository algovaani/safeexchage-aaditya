import mongoose from 'mongoose';

const treasuryWithdrawalSchema = new mongoose.Schema(
  {
    depositId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deposit',
      required: true,
      unique: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USDT' },
    usdtAmount: { type: Number, default: null },
    network: { type: String, default: '' },
    userTxnHash: { type: String, default: '' },
    platformAddress: { type: String, default: '' },
    fromAddress: { type: String, default: '' },
    gasTxHash: { type: String, default: '' },
    sweepMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    sweptAmount: { type: Number, default: null },
    sweptCurrency: { type: String, default: 'USDT' },
    adminWalletAddress: { type: String, required: true },
    outboundTxnHash: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'completed',
      index: true,
    },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'treasury_withdrawals' }
);

treasuryWithdrawalSchema.index({ createdAt: -1 });

export const TreasuryWithdrawal = mongoose.model('TreasuryWithdrawal', treasuryWithdrawalSchema);
