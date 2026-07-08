import mongoose from 'mongoose';

const stakingPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    lockDays: { type: Number, required: true, min: 1, max: 3650 },
    minAmount: { type: Number, required: true, min: 0 },
    /** Max USDT per investment. 0 = no upper limit (user chooses any amount). */
    maxAmount: { type: Number, required: true, min: 0, default: 0 },
    /** Total ROI % over the full lock period (not annualized). */
    apyPercent: { type: Number, required: true, min: 0.1, max: 500 },
    payoutType: {
      type: String,
      enum: ['end_of_plan', 'daily', 'monthly'],
      default: 'end_of_plan',
    },
    /** Admin-defined terms & conditions shown to the user before investing. */
    terms: { type: String, default: '', maxlength: 5000 },
    /** Shown when user confirms early withdrawal (principal only, no profit). */
    earlyWithdrawalMessage: { type: String, default: '', maxlength: 2000 },
    payoutMode: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto',
    },
    requiresApproval: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    /** Soft delete — hidden from users; existing investments remain valid. */
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'staking_plans' }
);

export const StakingPlan = mongoose.model('StakingPlan', stakingPlanSchema);
