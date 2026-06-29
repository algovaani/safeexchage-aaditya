import mongoose from 'mongoose';

const stakingPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    lockDays: { type: Number, required: true, min: 1, max: 3650 },
    minAmount: { type: Number, required: true, min: 0 },
    maxAmount: { type: Number, required: true, min: 0 },
    /** Total ROI % over the full lock period (not annualized). */
    apyPercent: { type: Number, required: true, min: 0.1, max: 500 },
    payoutType: {
      type: String,
      enum: ['end_of_plan', 'daily'],
      default: 'end_of_plan',
    },
    payoutMode: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto',
    },
    requiresApproval: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'staking_plans' }
);

export const StakingPlan = mongoose.model('StakingPlan', stakingPlanSchema);
