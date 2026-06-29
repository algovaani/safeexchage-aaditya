import mongoose from 'mongoose';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10_000;

export function parseDatatableQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || DEFAULT_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.pageSize || query.limit, 10) || DEFAULT_PAGE_SIZE)
  );
  const skip = (page - 1) * pageSize;
  const search = String(query.search || query.q || '').trim();
  const sortBy = String(query.sortBy || 'createdAt').trim();
  const sortDir = String(query.sortDir || query.sort || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const exportFormat = String(query.export || '').toLowerCase();

  return {
    page,
    pageSize,
    skip,
    search,
    sort: { [sortBy]: sortDir },
    sortBy,
    sortDir: sortDir === 1 ? 'asc' : 'desc',
    exportFormat,
    isExport: exportFormat === 'csv' || exportFormat === 'xlsx',
  };
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchRegex(search) {
  if (!search) return null;
  return new RegExp(escapeRegex(search), 'i');
}

export function parseObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

export function buildDateRangeFilter(query, field = 'createdAt') {
  const filter = {};
  if (query.from || query.to) {
    filter[field] = {};
    if (query.from) filter[field].$gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      filter[field].$lte = end;
    }
  }
  return filter;
}

export function paginatedPayload({ rows, total, page, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
  };
}

function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(typeof c.export === 'function' ? c.export(row) : row[c.key])).join(',')
  );
  return `\uFEFF${header}\n${lines.join('\n')}`;
}

export function sendCsvExport(res, filename, rows, columns) {
  const csv = rowsToCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

export function getExportLimit(isExport) {
  return isExport ? MAX_EXPORT_ROWS : 0;
}
