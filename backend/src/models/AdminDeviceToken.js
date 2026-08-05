import mongoose from 'mongoose';

const adminDeviceTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
    deviceLabel: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'admin_device_tokens' }
);

adminDeviceTokenSchema.index({ userId: 1, platform: 1 });

export const AdminDeviceToken = mongoose.model('AdminDeviceToken', adminDeviceTokenSchema);
