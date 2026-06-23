import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['crypto', 'fiat'], required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USDT' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    walletAddress: { type: String, default: '' },
    network: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifsc: { type: String, default: '' },
    accountHolder: { type: String, default: '' },
    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true, collection: 'withdrawals' }
);

withdrawalSchema.index({ createdAt: -1 });

export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
