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
