import mongoose from 'mongoose';

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    bnbWalletAddress: { type: String, default: '' },
    ethWalletAddress: { type: String, default: '' },
    usdtWalletAddress: { type: String, default: '' },
    trcWalletAddress: { type: String, default: '' },
    /** Always treated as manual in app code (auto Moralis/Tatum removed). Keep enum for legacy DB rows. */
    depositMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    bankName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankIfsc: { type: String, default: '' },
    bankBranch: { type: String, default: '' },
    bankAccountHolder: { type: String, default: '' },
    bankUpiId: { type: String, default: '' },
    bankQrCode: { type: String, default: '' },
    /** Visibility of admin bank details & QR code on the user side */
    showAdminPaymentAccount: { type: Boolean, default: true },
    bnbPrivateKey: { type: String, default: '', select: false },
    ethPrivateKey: { type: String, default: '', select: false },
    trcPrivateKey: { type: String, default: '', select: false },
    evmMnemonic: { type: String, default: '', select: false },
    referralRewardUsdt: { type: Number, default: 0, min: 0 },
    /** 1 USDT = X INR — used for balance display across the app */
    usdtInrRate: { type: Number, default: 83.5, min: 1, max: 500 },
    /** Cash-in-person deposit: 1 USDT = X INR */
    cashInPersonDepositRate: { type: Number, default: 0, min: 0 },
    /** Cash-in-person withdraw: 1 USDT = X INR */
    cashInPersonWithdrawRate: { type: Number, default: 0, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'platform_settings' }
);

export const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
