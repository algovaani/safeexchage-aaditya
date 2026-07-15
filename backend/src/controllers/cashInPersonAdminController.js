import { User } from '../models/User.js';
import { CashInPersonRequest } from '../models/CashInPersonRequest.js';
import {
  approveCashInPersonRequest,
  formatCashInPersonRequest,
  rejectCashInPersonRequest,
} from '../services/cashInPersonService.js';
import { error, success } from '../utils/response.js';
import {
  buildDateRangeFilter,
  getExportLimit,
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
  sendCsvExport,
} from '../utils/datatable.js';

const EXPORT_COLUMNS = [
  { key: 'userLabel', label: 'User', export: (r) => r.userLabel || '' },
  { key: 'type', label: 'Type', export: (r) => r.type || 'deposit' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'city', label: 'City' },
  {
    key: 'requestedAmount',
    label: 'Requested (USDT)',
    export: (r) => (r.requestedAmount != null ? r.requestedAmount : ''),
  },
  {
    key: 'creditedAmount',
    label: 'Settled (USDT)',
    export: (r) => (r.creditedAmount != null ? r.creditedAmount : ''),
  },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created', export: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
];

async function buildAdminFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  if (query.status) filter.status = query.status;
  if (query.type === 'deposit' || query.type === 'withdraw') filter.type = query.type;

  const re = searchRegex(search);
  if (re) {
    const users = await User.find({
      $or: [{ email: re }, { mobile: re }, { name: re }],
    })
      .select('_id')
      .limit(200)
      .lean();
    const userIds = users.map((u) => u._id);
    filter.$or = [{ userId: { $in: userIds } }, { mobile: re }, { city: re }];
  }

  return filter;
}

function enrichRow(row) {
  const formatted = formatCashInPersonRequest(row, { includeUser: true });
  const userLabel = formatted.user?.email || formatted.user?.mobile || formatted.mobile || String(formatted.userId);
  return { ...formatted, userLabel };
}

export async function listRequests(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = await buildAdminFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [rows, total] = await Promise.all([
      CashInPersonRequest.find(filter)
        .populate('userId', 'email mobile name')
        .sort(dt.sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      CashInPersonRequest.countDocuments(filter),
    ]);

    const data = rows.map(enrichRow);

    if (dt.isExport) {
      return sendCsvExport(res, 'cash-in-person.csv', data, EXPORT_COLUMNS);
    }

    return success(
      res,
      paginatedPayload({ rows: data, total, page: dt.page, pageSize: dt.pageSize }),
      'Cash in person requests fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function verifyRequest(req, res, next) {
  try {
    const { action, amount, note } = req.body;
    const request = await CashInPersonRequest.findById(req.params.id);

    if (!request) {
      return error(res, 'Request not found', 404);
    }

    if (action === 'approve') {
      const creditAmount =
        amount != null && amount !== ''
          ? Number(amount)
          : request.requestedAmount != null
            ? Number(request.requestedAmount)
            : null;

      if (!(creditAmount > 0)) {
        return error(res, 'Credit amount is required to approve', 400);
      }

      const { request: updated } = await approveCashInPersonRequest(
        request,
        req.userId,
        creditAmount,
        req.app.get('io')
      );
      await updated.populate('userId', 'email mobile name');
      return success(
        res,
        enrichRow(updated.toObject()),
        request.type === 'withdraw'
          ? 'Request approved and wallet debited'
          : 'Request approved and wallet credited'
      );
    }

    if (action === 'reject') {
      const updated = await rejectCashInPersonRequest(request, req.userId, note || '');
      await updated.populate('userId', 'email mobile name');
      return success(res, enrichRow(updated.toObject()), 'Request rejected');
    }

    return error(res, 'Invalid action', 400);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}
