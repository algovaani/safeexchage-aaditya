import mongoose from 'mongoose';

const adminNotificationSchema = new mongoose.Schema(
  {
    /** deposit_request | withdrawal_request | cash_in_person_request */
    type: {
      type: String,
      enum: ['deposit_request', 'withdrawal_request', 'cash_in_person_request'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    /** deposit | withdrawal | cash_in_person */
    refType: {
      type: String,
      enum: ['deposit', 'withdrawal', 'cash_in_person'],
      required: true,
      index: true,
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    amount: { type: Number, default: null },
    currency: { type: String, default: '' },
    channel: { type: String, default: '' }, // crypto | fiat
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false, index: true },
    /** Cleared when request is approved / rejected / cancelled */
    resolved: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'admin_notifications' }
);

adminNotificationSchema.index({ createdAt: -1 });
adminNotificationSchema.index({ read: 1, resolved: 1, createdAt: -1 });
/** One alert per request — prevents duplicate pushes on retries */
adminNotificationSchema.index({ type: 1, refId: 1 }, { unique: true });

export const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);
