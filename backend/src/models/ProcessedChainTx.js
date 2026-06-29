import mongoose from 'mongoose';

/** Prevents double-crediting the same on-chain transaction. */
const processedChainTxSchema = new mongoose.Schema(
  {
    chain: { type: String, enum: ['BNB', 'ETH', 'TRC'], required: true, index: true },
    txnHash: { type: String, required: true },
    depositId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deposit', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: '' },
  },
  { timestamps: true, collection: 'processed_chain_txs' }
);

processedChainTxSchema.index({ chain: 1, txnHash: 1 }, { unique: true });

export const ProcessedChainTx = mongoose.model('ProcessedChainTx', processedChainTxSchema);
