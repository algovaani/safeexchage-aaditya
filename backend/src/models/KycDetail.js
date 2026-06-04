import mongoose from 'mongoose';

const kycSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentType: { type: String, enum: ['aadhar', 'pan', 'passport'], required: true },
    filePath: { type: String, required: true },
    originalName: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

kycSchema.index({ userId: 1, documentType: 1 });

export const KycDetail = mongoose.model('KycDetail', kycSchema);
