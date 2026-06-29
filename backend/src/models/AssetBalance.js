import mongoose from 'mongoose';

const assetBalanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    asset: { type: String, required: true, uppercase: true },
    balance: { type: Number, default: 0 },
    lockedBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assetBalanceSchema.index({ userId: 1, asset: 1 }, { unique: true });

export const AssetBalance = mongoose.model('AssetBalance', assetBalanceSchema);
