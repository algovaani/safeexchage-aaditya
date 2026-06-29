import mongoose from 'mongoose';
import { generateUniqueReferralCode } from '../utils/referral.js';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      sparse: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    mobile: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['user', 'admin', 'system'], default: 'user' },
    status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    bnbWalletAddress: { type: String, default: '', trim: true },
    ethWalletAddress: { type: String, default: '', trim: true },
    trcWalletAddress: { type: String, default: '', trim: true },
    usdtWalletAddress: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

userSchema.pre('validate', function ensureContact(next) {
  if (!this.email && !this.mobile) {
    next(new Error('Either email or mobile is required'));
  } else {
    next();
  }
});

userSchema.pre('save', async function assignReferralCode(next) {
  if (this.referralCode) {
    next();
    return;
  }
  try {
    this.referralCode = await generateUniqueReferralCode();
    next();
  } catch (err) {
    next(err);
  }
});

export const User = mongoose.model('User', userSchema);
