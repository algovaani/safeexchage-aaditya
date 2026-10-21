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
    /** Funds locked on wallet when withdraw request is submitted. */
    fundsLocked: { type: Boolean, default: false },
    fundsLockedAmount: { type: Number, default: 0, min: 0 },
    /** Instant debit from main wallet on submit. */
    debitedFromMain: { type: Boolean, default: false },
    debitedAmount: { type: Number, default: 0, min: 0 },
    /** Amount settled on wallet when admin approves. */
    creditedAmount: { type: Number, default: null, min: 0 },
    currency: { type: String, default: 'USDT' },
    /** Deposit proof & reference */
    utrNumber: { type: String, default: '', trim: true },
    paymentProof: { type: String, default: '', trim: true },
    /** User bank details for withdraw */
    bankName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    ifsc: { type: String, default: '', trim: true },
    accountHolder: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
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
