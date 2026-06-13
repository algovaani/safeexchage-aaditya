import mongoose from 'mongoose';

const passwordOtpSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

passwordOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordOtp = mongoose.model('PasswordOtp', passwordOtpSchema);
