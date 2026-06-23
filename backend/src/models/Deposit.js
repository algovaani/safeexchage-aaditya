import mongoose from 'mongoose';

const fileMetaSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

const depositSchema = new mongoose.Schema(
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
    txnHash: { type: String, default: '', index: true, sparse: true },
    network: { type: String, default: '' },
    utrNumber: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    paymentProof: { type: fileMetaSchema, default: null },
    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true, collection: 'deposits' }
);

depositSchema.index({ createdAt: -1 });

export const Deposit = mongoose.model('Deposit', depositSchema);
