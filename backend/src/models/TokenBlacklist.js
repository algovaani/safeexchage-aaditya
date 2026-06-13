import mongoose from 'mongoose';

const tokenBlacklistSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TokenBlacklist = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
