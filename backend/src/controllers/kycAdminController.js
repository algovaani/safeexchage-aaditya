import { User } from '../models/User.js';
import { KycSubmission } from '../models/KycSubmission.js';
import { formatSubmission } from '../services/kycService.js';
import { error, success } from '../utils/response.js';
import {
  buildDateRangeFilter,
  getExportLimit,
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
  sendCsvExport,
} from '../utils/datatable.js';

const KYC_EXPORT_COLUMNS = [
  { key: 'userLabel', label: 'User', export: (r) => r.userLabel || '' },
  { key: 'docType', label: 'Document Type' },
  { key: 'status', label: 'Status' },
  { key: 'submittedAt', label: 'Submitted', export: (r) => (r.submittedAt ? new Date(r.submittedAt).toISOString() : '') },
  { key: 'reviewedAt', label: 'Reviewed', export: (r) => (r.reviewedAt ? new Date(r.reviewedAt).toISOString() : '') },
  { key: 'adminNote', label: 'Admin Note', export: (r) => r.adminNote || '' },
];

async function buildKycFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  if (query.status) filter.status = query.status;
  if (query.docType) filter.docType = query.docType;

  const re = searchRegex(search);
  if (re) {
    const users = await User.find({
      $or: [{ email: re }, { mobile: re }, { name: re }],
    })
      .select('_id')
      .limit(200)
      .lean();
    const userIds = users.map((u) => u._id);
    filter.$or = [{ userId: { $in: userIds } }, { docType: re }, { status: re }];
  }

  return filter;
}

export async function listSubmissions(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = await buildKycFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [rows, total] = await Promise.all([
      KycSubmission.find(filter)
        .populate('userId', 'email mobile name')
        .sort(dt.sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      KycSubmission.countDocuments(filter),
    ]);

    const data = rows.map((row) => {
      const formatted = formatSubmission(req, row, { includeAdminNote: true });
      return {
        ...formatted,
        userLabel: formatted.user?.email || formatted.user?.mobile || String(formatted.userId),
      };
    });

    if (dt.isExport) {
      return sendCsvExport(res, 'kyc.csv', data, KYC_EXPORT_COLUMNS);
    }

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'KYC submissions fetched'
    );
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

    return success(
      res,
      formatSubmission(req, row.toObject(), { includeAdminNote: true }),
      action === 'approve' ? 'KYC approved' : 'KYC rejected'
    );
  } catch (e) {
    return next(e);
  }
}
