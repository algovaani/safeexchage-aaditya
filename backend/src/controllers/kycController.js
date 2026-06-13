import { KycSubmission } from '../models/KycSubmission.js';
import { removeUploadedFiles } from '../middleware/kycUpload.js';
import { formatSubmission, mapUploadedFiles } from '../services/kycService.js';
import { error, success } from '../utils/response.js';

const REQUIRED_FILES = ['doc_front', 'selfie', 'address_proof'];

export async function submit(req, res, next) {
  try {
    const docType = req.body.doc_type;

    const existing = await KycSubmission.findOne({
      userId: req.userId,
      status: { $in: ['pending', 'approved'] },
    });

    if (existing) {
      removeUploadedFiles(req.files);
      return error(
        res,
        existing.status === 'approved'
          ? 'KYC is already approved'
          : 'A KYC submission is already pending review',
        409
      );
    }

    const missing = REQUIRED_FILES.filter((f) => !req.files?.[f]?.[0]);
    if (missing.length) {
      removeUploadedFiles(req.files);
      return error(res, `Missing required files: ${missing.join(', ')}`, 400);
    }

    const files = mapUploadedFiles(req.files);

    const submission = await KycSubmission.create({
      userId: req.userId,
      docType,
      files,
      status: 'pending',
    });

    return success(res, formatSubmission(req, submission), 'KYC submitted successfully', 201);
  } catch (e) {
    removeUploadedFiles(req.files);
    return next(e);
  }
}

export async function status(req, res, next) {
  try {
    const submission = await KycSubmission.findOne({ userId: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!submission) {
      return success(res, {
        status: 'not_submitted',
        submittedAt: null,
        adminNote: null,
      }, 'No KYC submission found');
    }

    const data = {
      status: submission.status,
      docType: submission.docType,
      submittedAt: submission.createdAt,
      reviewedAt: submission.reviewedAt,
      adminNote: submission.status === 'rejected' ? submission.adminNote || '' : null,
      files: formatSubmission(req, submission).files,
    };

    return success(res, data, 'KYC status fetched');
  } catch (e) {
    return next(e);
  }
}
