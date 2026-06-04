import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['deposit', 'withdrawal'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USDT' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
    method: { type: String, enum: ['manual', 'gateway'], default: 'manual' },
    reference: { type: String, default: '' },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
