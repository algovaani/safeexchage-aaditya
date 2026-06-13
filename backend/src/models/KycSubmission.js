import mongoose from 'mongoose';

const fileMetaSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

const kycSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    docType: {
      type: String,
      enum: ['passport', 'driving_license', 'national_id'],
      required: true,
    },
    files: {
      docFront: { type: fileMetaSchema, default: null },
      docBack: { type: fileMetaSchema, default: null },
      selfie: { type: fileMetaSchema, default: null },
      addressProof: { type: fileMetaSchema, default: null },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'kyc_submissions' }
);

kycSubmissionSchema.index({ userId: 1, status: 1 });

export const KycSubmission = mongoose.model('KycSubmission', kycSubmissionSchema);
