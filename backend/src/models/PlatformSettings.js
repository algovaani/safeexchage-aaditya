import mongoose from 'mongoose';

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    bnbWalletAddress: { type: String, default: '' },
    ethWalletAddress: { type: String, default: '' },
    usdtWalletAddress: { type: String, default: '' },
    trcWalletAddress: { type: String, default: '' },
    /** manual = user submits tx + admin approves; auto = chain watcher credits */
    depositMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    bankName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankIfsc: { type: String, default: '' },
    bankBranch: { type: String, default: '' },
    bankAccountHolder: { type: String, default: '' },
    bnbPrivateKey: { type: String, default: '', select: false },
    ethPrivateKey: { type: String, default: '', select: false },
    trcPrivateKey: { type: String, default: '', select: false },
    evmMnemonic: { type: String, default: '', select: false },
    referralRewardUsdt: { type: Number, default: 0, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'platform_settings' }
);

export const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
