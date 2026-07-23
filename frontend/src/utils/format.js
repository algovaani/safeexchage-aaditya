/** Display Login ID without India country code (91). Emails unchanged. */
export function formatLoginId(value) {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  if (raw.includes('@')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits || raw;
}

export function fmtINR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtUSD(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function inrFromUsdt(usdt, rate = 83.5) {
  return Number(usdt) * rate;
}
