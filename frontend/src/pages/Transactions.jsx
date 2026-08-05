import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Inbox, Loader2, Search } from 'lucide-react';
import { api, parseApiResponse, withdrawalAPI } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { fmtINR, fmtUSD } from '../utils/format.js';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';

function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'spot', label: 'Spot trade' },
  { value: 'trade', label: 'Trade' },
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'stake', label: 'Staking' },
  { value: 'admin', label: 'Admin adjustment' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function Transactions() {
  const toast = useToast();
  const dialog = useDialog();
  const { toInr } = usePlatformConfig();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [cancelBusyId, setCancelBusyId] = useState(null);

  const debouncedSearch = useDebounced(search);
  const filterKey = `${debouncedSearch}|${type}|${status}|${from}|${to}|${pageSize}`;
  const filterKeyRef = useRef(filterKey);
  const queryPage = filterKeyRef.current !== filterKey ? 1 : page;

  const queryParams = useMemo(() => {
    const params = { page: queryPage, pageSize, sortBy: 'createdAt', sortDir: 'desc' };
    if (debouncedSearch) params.search = debouncedSearch;
    if (type) params.type = type;
    if (status) params.status = status;
    if (from) params.from = from;
    if (to) params.to = to;
    return params;
  }, [queryPage, pageSize, debouncedSearch, type, status, from, to]);

  const fetchRows = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/transactions', { params: queryParams, signal });
      if (signal?.aborted) return;
      const payload = parseApiResponse(data);
      setRows(payload?.rows || []);
      setTotal(payload?.total || 0);
      setTotalPages(payload?.totalPages || 1);
    } catch (err) {
      if (signal?.aborted || err?.code === 'ERR_CANCELED') return;
      setError(err.message || 'Failed to load transactions');
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    const controller = new AbortController();
    fetchRows(controller.signal);
    return () => controller.abort();
  }, [fetchRows, filterKey, page]);

  useEffect(() => {
    const onOrders = () => fetchRows();
    window.addEventListener('orders:updated', onOrders);
    return () => {
      window.removeEventListener('orders:updated', onOrders);
    };
  }, [fetchRows]);

  async function handleExport() {
    setExporting(true);
    try {
      const exportParams = { ...queryParams, export: 'csv' };
      delete exportParams.page;
      delete exportParams.pageSize;
      const { data } = await api.get('/transactions', {
        params: exportParams,
        responseType: 'blob',
      });
      const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'transactions.csv';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Transactions exported successfully.');
    } catch (err) {
      const message = err.message || 'Export failed';
      setError(message);
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  async function cancelWithdrawal(row) {
    const withdrawalId = row.withdrawal_id;
    if (!withdrawalId) return;
    const ok = await dialog.confirm({
      title: 'Cancel withdrawal?',
      message: `Cancel pending withdrawal of ${row.amount} ${row.currency || 'USDT'}? Locked funds will be released.`,
      confirmLabel: 'Cancel withdrawal',
      cancelLabel: 'Keep pending',
      variant: 'danger',
    });
    if (!ok) return;
    setCancelBusyId(String(withdrawalId));
    try {
      await withdrawalAPI.cancel(withdrawalId);
      toast.success('Withdrawal cancelled');
      await fetchRows();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel withdrawal');
    } finally {
      setCancelBusyId(null);
    }
  }

  const fromRow = total === 0 ? 0 : (queryPage - 1) * pageSize + 1;
  const toRow = Math.min(queryPage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-text-primary mb-1">Reports</h1>
          <p className="text-sm text-text-secondary">Transaction history and fund movements</p>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--ghost text-sm inline-flex items-center gap-2"
          onClick={handleExport}
          disabled={exporting || loading}
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export Excel
        </button>
      </div>

      <div className="ui-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-border bg-bg-secondary">
            <Search size={16} className="text-text-muted" />
            <input
              type="search"
              className="flex-1 bg-transparent outline-none text-sm"
              // placeholder="Search type, status, reference…"
              placeholder="Search type, status, remark…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="ui-input w-auto text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPE_FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select className="ui-input w-auto text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>{f.label}</option>
            ))}
          </select>
          <input type="date" className="ui-input w-auto text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="ui-input w-auto text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          <select className="ui-input w-auto text-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>Balance after</th>
                  <th>Status</th>
                  <th>Remark</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const signed = Number(t.signed_amount ?? t.amount);
                  const isDebit = signed < 0;
                  const canCancel =
                    t.type === 'withdrawal' &&
                    String(t.status).toLowerCase() === 'pending' &&
                    t.withdrawal_id;
                  return (
                    <tr key={t.id}>
                      <td>
                        <StatusBadge status={t.type_label || t.type} />
                      </td>
                      <td>{t.currency || 'USDT'}</td>
                      <td className={`tabular-nums ${isDebit ? 'text-red-400' : 'text-green-400'}`}>
                        {isDebit ? '−' : '+'}
                        {fmtUSD(Math.abs(Number(t.amount)))}
                        <span className="text-text-muted text-xs ml-1">
                          ({fmtINR(toInr(Math.abs(Number(t.amount))))})
                        </span>
                      </td>
                      <td className="tabular-nums text-text-secondary">
                        {t.balance_after != null ? fmtUSD(t.balance_after) : '—'}
                      </td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="text-text-secondary text-xs max-w-[200px] truncate" title={t.remark || t.reference || ''}>
                        {t.remark || t.reference || '—'}
                      </td>
                      <td className="text-text-secondary text-xs tabular-nums">
                      {t.date ? new Date(t.date).toLocaleString() : '—'}
                       </td>
                      <td>
                        {canCancel ? (
                          <button
                            type="button"
                            className="text-xs text-loss hover:underline bg-transparent border-0 cursor-pointer p-0 disabled:opacity-50"
                            disabled={cancelBusyId === String(t.withdrawal_id)}
                            onClick={() => cancelWithdrawal(t)}
                          >
                            {cancelBusyId === String(t.withdrawal_id) ? 'Cancelling…' : 'Cancel'}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Inbox size={32} className="mb-3 opacity-40" />
            <p>No transactions yet</p>
            <Link to="/wallet" className="text-accent text-sm mt-2">Go to wallet</Link>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border text-sm text-text-secondary">
            <span>Showing {fromRow}–{toRow} of {total}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ui-btn ui-btn--ghost text-sm"
                disabled={queryPage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {queryPage} of {totalPages}</span>
              <button
                type="button"
                className="ui-btn ui-btn--ghost text-sm"
                disabled={queryPage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
