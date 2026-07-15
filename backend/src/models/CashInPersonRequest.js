import mongoose from 'mongoose';

const cashInPersonRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['deposit', 'withdraw'],
      default: 'deposit',
      index: true,
    },
    mobile: { type: String, required: true, trim: true, maxlength: 20 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    /** Amount user expects to deposit/withdraw in person (USDT). */
    requestedAmount: { type: Number, default: null, min: 0 },
    /** Amount settled on wallet when admin approves. */
    creditedAmount: { type: Number, default: null, min: 0 },
    currency: { type: String, default: 'USDT' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true, collection: 'cash_in_person_requests' }
);

cashInPersonRequestSchema.index({ createdAt: -1 });

export const CashInPersonRequest = mongoose.model('CashInPersonRequest', cashInPersonRequestSchema);
