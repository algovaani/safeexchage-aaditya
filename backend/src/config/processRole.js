/**
 * Split API HTTP traffic from background scanners/crons.
 *
 * PROCESS_ROLE=
 *   all    — single process (local/dev default)
 *   api    — HTTP + WebSocket only (no monitors/crons)
 *   worker — background jobs only (PM2 name: scanner)
 *   scanner — alias of worker
 */
export function getProcessRole() {
  const raw = String(process.env.PROCESS_ROLE || 'all').trim().toLowerCase();
  if (raw === 'scanner') return 'worker';
  if (raw === 'api' || raw === 'worker' || raw === 'all') return raw;
  return 'all';
}

export function shouldRunHttp() {
  const role = getProcessRole();
  return role === 'all' || role === 'api';
}

export function shouldRunBackgroundJobs() {
  const role = getProcessRole();
  return role === 'all' || role === 'worker';
}
