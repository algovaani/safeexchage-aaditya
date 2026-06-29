import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import './AdminDataTable.css';

function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function parsePaginatedResponse(data) {
  if (data && typeof data === 'object' && 'success' in data) {
    if (!data.success) throw new Error(data.message || 'Request failed');
    const payload = data.data;
    if (payload && Array.isArray(payload.rows)) {
      return payload;
    }
    if (Array.isArray(payload)) {
      return { rows: payload, total: payload.length, page: 1, pageSize: payload.length, totalPages: 1 };
    }
    return { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
  }
  if (Array.isArray(data)) {
    return { rows: data, total: data.length, page: 1, pageSize: data.length, totalPages: 1 };
  }
  return { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
}

export default function AdminDataTable({
  title,
  endpoint,
  columns,
  filters = [],
  exportFilename = 'export.csv',
  refreshKey = 0,
  emptyMessage = 'No records found.',
  selectable = false,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  onRowsChange,
  rowIdKey = 'id',
}) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [internalSelected, setInternalSelected] = useState([]);

  const selectedIds = controlledSelectedIds ?? internalSelected;
  const setSelectedIds = onSelectionChange ?? setInternalSelected;

  const debouncedSearch = useDebounced(search);

  const queryParams = useMemo(() => {
    const params = {
      page,
      pageSize,
      sortBy,
      sortDir,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    for (const [key, value] of Object.entries(filterValues)) {
      if (value !== '' && value != null) params[key] = value;
    }
    return params;
  }, [page, pageSize, debouncedSearch, filterValues, sortBy, sortDir]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(endpoint, { params: queryParams });
      const payload = parsePaginatedResponse(data);
      setRows(payload.rows);
      setTotal(payload.total);
      setTotalPages(payload.totalPages);
      onRowsChange?.(payload.rows);
    } catch (err) {
      const message = err.message || 'Failed to load data';
      setError(message);
      toast.error(message);
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [endpoint, queryParams]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows, refreshKey]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [debouncedSearch, filterValues, pageSize]);

  function rowId(row) {
    return String(row[rowIdKey] || row._id || row.id);
  }

  function toggleRow(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllVisible() {
    const ids = rows.map(rowId);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
    }
  }

  function handleFilterChange(key, value) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSort(key) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const exportParams = { ...queryParams, export: 'csv' };
      delete exportParams.page;
      delete exportParams.pageSize;
      const { data } = await api.get(endpoint, {
        params: exportParams,
        responseType: 'blob',
      });
      const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded successfully.');
    } catch (err) {
      const message = err.message || 'Export failed';
      setError(message);
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="admin-card admin-dt">
      <div className="admin-dt__head">
        <h2>
          {title} {total > 0 && <span className="admin-dt__count">({total})</span>}
        </h2>
        <button
          type="button"
          className="admin-btn admin-btn--ghost admin-btn--sm"
          onClick={handleExport}
          disabled={exporting || loading}
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export Excel
        </button>
      </div>

      <div className="admin-dt__toolbar">
        <div className="admin-dt__search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filters.map((f) =>
          f.type === 'date' ? (
            <input
              key={f.key}
              type="date"
              className="admin-dt__filter"
              value={filterValues[f.key] || ''}
              onChange={(e) => handleFilterChange(f.key, e.target.value)}
              title={f.label}
            />
          ) : (
            <select
              key={f.key}
              className="admin-dt__filter"
              value={filterValues[f.key] || ''}
              onChange={(e) => handleFilterChange(f.key, e.target.value)}
            >
              <option value="">{f.label}</option>
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )
        )}
        <select
          className="admin-dt__filter"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>

      {error && <p className="admin-dt__error">{error}</p>}
      {loading && <p className="admin-loading">Loading…</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {selectable && (
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={rows.length > 0 && rows.every((r) => selectedIds.includes(rowId(r)))}
                    onChange={toggleAllVisible}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key}>
                  {col.sortable ? (
                    <button type="button" className="admin-dt__sort" onClick={() => handleSort(col.key)}>
                      {col.label}
                      {sortBy === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading &&
              rows.map((row) => {
                const id = rowId(row);
                return (
                <tr key={id} className={selectedIds.includes(id) ? 'admin-dt__row--selected' : ''}>
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${id}`}
                        checked={selectedIds.includes(id)}
                        onChange={() => toggleRow(id)}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key}>{col.render ? col.render(row) : row[col.key] ?? '—'}</td>
                  ))}
                </tr>
              );})}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="admin-empty">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-dt__footer">
        <span className="admin-dt__range">
          {total > 0 ? `Showing ${from}–${to} of ${total}` : 'No results'}
        </span>
        <div className="admin-dt__pager">
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
