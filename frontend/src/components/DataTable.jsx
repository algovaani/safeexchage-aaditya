import { useEffect, useMemo, useState } from 'react';
import './DataTable.css';

/**
 * @typedef {Object} DataTableColumn
 * @property {string} key
 * @property {string} label
 * @property {boolean} [sortable]
 * @property {(row: object) => string|number} [sortValue]
 * @property {(row: object, index: number) => import('react').ReactNode} [render]
 * @property {string} [mobileLabel]
 * @property {boolean} [hideOnMobile]
 */

function defaultSortValue(row, key) {
  const value = row[key];
  if (value == null) return '';
  return typeof value === 'number' ? value : String(value).toLowerCase();
}

export default function DataTable({
  columns,
  data = [],
  loading = false,
  emptyMessage = 'No data found.',
  rowKey = 'id',
  pageSize: defaultPageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  showPagination = true,
  className = '',
  skeletonRows = 6,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sortedData = useMemo(() => {
    if (!sortBy) return data;
    const col = columns.find((c) => c.key === sortBy);
    if (!col?.sortable) return data;

    const getValue = col.sortValue || ((row) => defaultSortValue(row, col.key));
    return [...data].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [columns, data, sortBy, sortDir]);

  const total = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = showPagination
    ? sortedData.slice((safePage - 1) * pageSize, safePage * pageSize)
    : sortedData;

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = showPagination ? Math.min(safePage * pageSize, total) : total;

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, totalPages)));
  }, [totalPages]);

  function resolveRowKey(row, index) {
    const key = row[rowKey] ?? row.id ?? row._id ?? row.symbol;
    return key != null ? String(key) : String(index);
  }

  function handleSort(key) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  function handlePageSizeChange(next) {
    setPageSize(next);
    setPage(1);
  }

  return (
    <div className={`app-dt ${className}`.trim()}>
      {loading ? (
        <div className="app-dt__loading">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <div key={i} className="skeleton app-dt__skeleton" />
          ))}
        </div>
      ) : (
        <div className="app-dt__scroll">
          <table className="data-table app-dt__table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={col.hideOnMobile ? 'app-dt__col--hide-mobile' : ''}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        className="app-dt__sort"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        {sortBy === col.key && (
                          <span className="app-dt__sort-icon" aria-hidden>
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => {
                const globalIndex = showPagination ? (safePage - 1) * pageSize + index : index;
                return (
                  <tr key={resolveRowKey(row, globalIndex)}>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        data-label={col.mobileLabel || col.label}
                        className={col.hideOnMobile ? 'app-dt__col--hide-mobile' : ''}
                      >
                        {col.render
                          ? col.render(row, globalIndex)
                          : row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!pageRows.length && (
                <tr>
                  <td colSpan={columns.length} className="app-dt__empty">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && showPagination && (
        <div className="app-dt__footer">
          <span className="app-dt__range">
            {total > 0 ? `Showing ${from}–${to} of ${total}` : 'No results'}
          </span>
          <div className="app-dt__footer-actions">
            <select
              className="ui-input app-dt__pagesize"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <div className="app-dt__pager">
              <button
                type="button"
                className="btn-secondary !h-8 !text-xs"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary !h-8 !text-xs"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !showPagination && total > 0 && (
        <div className="app-dt__footer app-dt__footer--simple">
          <span>{total} items</span>
        </div>
      )}
    </div>
  );
}
