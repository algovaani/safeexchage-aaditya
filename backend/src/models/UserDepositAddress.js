import mongoose from 'mongoose';

const userDepositAddressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chain: { type: String, enum: ['BNB', 'ETH', 'TRC'], required: true, index: true },
    address: { type: String, required: true },
    network: { type: String, default: '' },
    currency: { type: String, default: 'USDT' },
    /** Only auto-credit on-chain txs after user opened the deposit screen. */
    watchActiveFrom: { type: Date, default: null },
  },
  { timestamps: true, collection: 'user_deposit_addresses' }
);

userDepositAddressSchema.index({ userId: 1, chain: 1 }, { unique: true });
userDepositAddressSchema.index({ address: 1 });

export const UserDepositAddress = mongoose.model('UserDepositAddress', userDepositAddressSchema);
