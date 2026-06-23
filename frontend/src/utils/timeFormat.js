/** Market/trade timestamps with 0.5s precision, e.g. 14:32:05.5 */
export function formatMarketTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';

  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const half = d.getMilliseconds() >= 500 ? '5' : '0';

  return `${h}:${m}:${s}.${half}`;
}

/** Live clock string (updates every 500ms). */
export function formatLiveClock(date = new Date()) {
  return formatMarketTime(date.getTime());
}
