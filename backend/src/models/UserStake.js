import mongoose from 'mongoose';

const userStakeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'StakingPlan', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    apyPercent: { type: Number, required: true },
    lockDays: { type: Number, required: true },
    startDate: { type: Date, required: true },
    maturityDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'matured', 'withdrawn'],
      default: 'active',
      index: true,
    },
    rewardEarned: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'user_stakes' }
);

userStakeSchema.index({ userId: 1, status: 1 });

export const UserStake = mongoose.model('UserStake', userStakeSchema);
