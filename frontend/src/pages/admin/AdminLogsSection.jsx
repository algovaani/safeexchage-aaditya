import { useMemo, useState } from 'react';
import { api, parseApiResponse } from '../../api/client.js';
import AdminDataTable from '../../components/AdminDataTable.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDialog } from '../../context/DialogContext.jsx';

function LevelBadge({ level }) {
  const s = String(level || '').toLowerCase();
  const cls =
    s === 'fatal'
      ? 'admin-badge--rejected'
      : s === 'warn'
        ? 'admin-badge--pending'
        : 'admin-badge--rejected';
  return <span className={`admin-badge ${cls}`}>{level || 'error'}</span>;
}

function truncate(text, n = 80) {
  const t = String(text || '');
  if (t.length <= n) return t || '—';
  return `${t.slice(0, n)}…`;
}

function LogDetailDrawer({ row, onClose }) {
  if (!row) return null;
  return (
    <>
      <button type="button" className="admin-kyc-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="admin-kyc-drawer admin-logs-detail" role="dialog" aria-label="Log detail">
        <div className="admin-kyc-drawer__head">
          <div>
            <h2>Crash / error detail</h2>
            <p>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</p>
          </div>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="admin-logs-detail__body">
          <dl className="admin-logs-detail__meta">
            <div>
              <dt>Level</dt>
              <dd>
                <LevelBadge level={row.level} />
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                <code>{row.source}</code>
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                <code>{row.location || '—'}</code>
              </dd>
            </div>
            {(row.method || row.path) && (
              <div>
                <dt>Request</dt>
                <dd>
                  <code>
                    {row.method} {row.path}
                    {row.statusCode != null ? ` → ${row.statusCode}` : ''}
                  </code>
                </dd>
              </div>
            )}
            {row.ip ? (
              <div>
                <dt>IP</dt>
                <dd>{row.ip}</dd>
              </div>
            ) : null}
          </dl>

          <h4>Why (message)</h4>
          <pre className="admin-logs-detail__pre">{row.message || '—'}</pre>

          <h4>Stack trace</h4>
          <pre className="admin-logs-detail__pre admin-logs-detail__pre--stack">
            {row.stack || 'No stack available'}
          </pre>
        </div>
      </aside>
    </>
  );
}

export default function AdminLogsSection({ refreshKey = 0 }) {
  const toast = useToast();
  const dialog = useDialog();
  const [selected, setSelected] = useState(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  const columns = useMemo(
    () => [
      {
        key: 'createdAt',
        label: 'Time',
        sortable: true,
        render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'),
      },
      {
        key: 'level',
        label: 'Level',
        sortable: true,
        render: (row) => <LevelBadge level={row.level} />,
      },
      {
        key: 'source',
        label: 'Source',
        sortable: true,
        render: (row) => <code className="admin-logs-source">{row.source}</code>,
      },
      {
        key: 'location',
        label: 'Where',
        sortable: true,
        render: (row) => (
          <code className="admin-logs-where" title={row.location || ''}>
            {truncate(row.location, 48)}
          </code>
        ),
      },
      {
        key: 'message',
        label: 'Why',
        render: (row) => (
          <span title={row.message || ''}>{truncate(row.message, 72)}</span>
        ),
      },
      {
        key: 'path',
        label: 'Request',
        render: (row) =>
          row.path ? (
            <code title={`${row.method || ''} ${row.path}`}>
              {truncate(`${row.method || ''} ${row.path}`.trim(), 36)}
            </code>
          ) : (
            '—'
          ),
      },
    ],
    []
  );

  const filters = useMemo(
    () => [
      {
        key: 'level',
        label: 'Level',
        options: [
          { value: '', label: 'All levels' },
          { value: 'fatal', label: 'Fatal (crash)' },
          { value: 'error', label: 'Error' },
          { value: 'warn', label: 'Warn' },
        ],
      },
      {
        key: 'source',
        label: 'Source',
        options: [
          { value: '', label: 'All sources' },
          { value: 'uncaughtException', label: 'Uncaught exception' },
          { value: 'unhandledRejection', label: 'Unhandled rejection' },
          { value: 'http', label: 'HTTP 5xx' },
          { value: 'process', label: 'Process' },
          { value: 'service', label: 'Service' },
        ],
      },
    ],
    []
  );

  async function clearOldLogs() {
    const ok = await dialog.confirm({
      title: 'Clear old logs?',
      message: 'Delete system logs older than 30 days? Recent crash records will be kept.',
      confirmLabel: 'Clear older than 30 days',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      const { data } = await api.delete('/admin/logs', { params: { days: 30 } });
      const payload = parseApiResponse(data);
      toast.success(`Deleted ${payload?.deleted ?? 0} log(s)`);
      setLocalRefresh((n) => n + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to clear logs');
    }
  }

  return (
    <>
      <p style={{ color: 'var(--adm-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Tracks server crashes and internal errors: <strong>where</strong> it failed and{' '}
        <strong>why</strong> (message + stack). Click a row for full detail.
      </p>
      <div style={{ marginBottom: '0.75rem' }}>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={clearOldLogs}>
          Clear logs older than 30 days
        </button>
      </div>
      <AdminDataTable
        title="System crash & error logs"
        endpoint="/admin/logs"
        columns={columns}
        filters={filters}
        exportFilename="system-logs.csv"
        refreshKey={refreshKey + localRefresh}
        emptyMessage="No crashes or errors recorded yet."
        searchPlaceholder="Search message, location, path…"
        onRowClick={(row) => setSelected(row)}
      />
      <LogDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </>
  );
}
