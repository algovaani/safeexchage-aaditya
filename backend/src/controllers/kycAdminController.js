import { KycSubmission } from '../models/KycSubmission.js';
import { formatSubmission } from '../services/kycService.js';
import { error, success } from '../utils/response.js';

export async function listSubmissions(req, res, next) {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) {
      const allowed = ['pending', 'approved', 'rejected'];
      if (!allowed.includes(status)) {
        return error(res, `status must be one of: ${allowed.join(', ')}`, 400);
      }
      filter.status = status;
    }

    const rows = await KycSubmission.find(filter)
      .populate('userId', 'email mobile name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const data = rows.map((row) => formatSubmission(req, row, { includeAdminNote: true }));
    return success(res, data, 'KYC submissions fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getSubmission(req, res, next) {
  try {
    const row = await KycSubmission.findById(req.params.id)
      .populate('userId', 'email mobile name')
      .lean();

    if (!row) {
      return error(res, 'KYC submission not found', 404);
    }

    return success(res, formatSubmission(req, row, { includeAdminNote: true }), 'KYC submission fetched');
  } catch (e) {
    return next(e);
  }
}

export async function reviewSubmission(req, res, next) {
  try {
    const { action, note } = req.body;
    const row = await KycSubmission.findById(req.params.id);

    if (!row) {
      return error(res, 'KYC submission not found', 404);
    }

    if (row.status !== 'pending') {
      return error(res, 'Only pending submissions can be reviewed', 400);
    }

    row.status = action === 'approve' ? 'approved' : 'rejected';
    row.adminNote = note?.trim() || '';
    row.reviewedBy = req.userId;
    row.reviewedAt = new Date();
    await row.save();

    await row.populate('userId', 'email mobile name');

    return success(res, formatSubmission(req, row.toObject(), { includeAdminNote: true }), action === 'approve' ? 'KYC approved' : 'KYC rejected');
  } catch (e) {
    return next(e);
  }
}
