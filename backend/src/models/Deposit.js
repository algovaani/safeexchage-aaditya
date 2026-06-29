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
    /** USDT credited to wallet (market conversion for non-USDT crypto). */
    usdtAmount: { type: Number, default: null },
    /** Market rate used when usdtAmount was calculated (base asset in USDT). */
    conversionRate: { type: Number, default: null },
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
    /** Crypto on platform address: pending_sweep until admin moves to own wallet. */
    treasuryStatus: {
      type: String,
      enum: ['not_applicable', 'pending_sweep', 'swept'],
      default: 'not_applicable',
      index: true,
    },
    treasuryWithdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreasuryWithdrawal',
      default: null,
    },
    source: { type: String, enum: ['user', 'chain_watcher', 'payhook', 'admin'], default: 'user' },
    autoVerified: { type: Boolean, default: false },
    chain: { type: String, enum: ['BNB', 'ETH', 'TRC', ''], default: '', index: true },
    /** User deposit wallet that received funds */
    toAddress: { type: String, default: '', index: true, sparse: true },
    /** Sender wallet from on-chain transfer */
    fromAddress: { type: String, default: '' },
    payhookPaymentId: { type: String, default: '', index: true, sparse: true },
    payhookCheckoutUrl: { type: String, default: '' },
    payhookDepositAddress: { type: String, default: '' },
  },
  { timestamps: true, collection: 'deposits' }
);

depositSchema.index({ createdAt: -1 });

export const Deposit = mongoose.model('Deposit', depositSchema);
