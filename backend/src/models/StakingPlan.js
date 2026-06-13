import mongoose from 'mongoose';

const stakingPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    apyPercent: { type: Number, required: true, min: 1, max: 500 },
    lockDays: { type: Number, required: true, min: 1, max: 3650 },
    minAmount: { type: Number, required: true, min: 0 },
    maxAmount: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'staking_plans' }
);

export const StakingPlan = mongoose.model('StakingPlan', stakingPlanSchema);
