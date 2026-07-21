import { SystemLog } from '../models/SystemLog.js';
import { formatSystemLog } from '../services/systemLogService.js';
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
  { key: 'createdAt', label: 'Time', export: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
  { key: 'level', label: 'Level' },
  { key: 'source', label: 'Source' },
  { key: 'location', label: 'Where', export: (r) => r.location || '' },
  { key: 'message', label: 'Message', export: (r) => r.message || '' },
  { key: 'method', label: 'Method', export: (r) => r.method || '' },
  { key: 'path', label: 'Path', export: (r) => r.path || '' },
  { key: 'statusCode', label: 'Status', export: (r) => (r.statusCode != null ? String(r.statusCode) : '') },
];

function buildFilter(query, search) {
  const filter = { ...buildDateRangeFilter(query) };
  if (query.level) filter.level = query.level;
  if (query.source) filter.source = query.source;

  const re = searchRegex(search);
  if (re) {
    filter.$or = [{ message: re }, { location: re }, { path: re }, { stack: re }];
  }
  return filter;
}

export async function listSystemLogs(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = buildFilter(req.query, dt.search);
    const limit = dt.isExport ? getExportLimit(true) : dt.pageSize;
    const skip = dt.isExport ? 0 : dt.skip;

    const [rows, total] = await Promise.all([
      SystemLog.find(filter).sort(dt.sort).skip(skip).limit(limit).lean(),
      SystemLog.countDocuments(filter),
    ]);

    const formatted = rows.map(formatSystemLog);

    if (dt.isExport) {
      return sendCsvExport(res, 'system-logs.csv', formatted, EXPORT_COLUMNS);
    }

    return success(
      res,
      paginatedPayload({ rows: formatted, total, page: dt.page, pageSize: dt.pageSize })
    );
  } catch (err) {
    return next(err);
  }
}

export async function getSystemLog(req, res, next) {
  try {
    const doc = await SystemLog.findById(req.params.id).lean();
    if (!doc) return error(res, 'Log not found', 404);
    return success(res, formatSystemLog(doc));
  } catch (err) {
    return next(err);
  }
}

/** Delete logs older than N days (default 30), or all if days=0 with confirm. */
export async function clearSystemLogs(req, res, next) {
  try {
    const days = Number(req.body?.days ?? req.query?.days ?? 30);
    if (!Number.isFinite(days) || days < 0) {
      return error(res, 'days must be a non-negative number', 400);
    }

    let result;
    if (days === 0) {
      result = await SystemLog.deleteMany({});
    } else {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      result = await SystemLog.deleteMany({ createdAt: { $lt: cutoff } });
    }

    return success(res, { deleted: result.deletedCount || 0 }, 'Logs cleared');
  } catch (err) {
    return next(err);
  }
}
