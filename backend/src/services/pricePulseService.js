/**
 * Temporary admin price pulses: spike chart + fill orders, then revert to market.
 */
const pulses = new Map();

/** @returns {{ price: number, until: number, fromPrice: number } | null} */
export function getActivePulse(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const p = pulses.get(sym);
  if (!p) return null;
  if (Date.now() > p.until) {
    pulses.delete(sym);
    return null;
  }
  return p;
}

export function getActivePulsePrice(symbol) {
  return getActivePulse(symbol)?.price ?? null;
}

/**
 * Hold pulsed price for `holdMs` so live stream / charts show the spike,
 * then auto-clear so the next market tick returns to normal.
 */
export function setPricePulse(symbol, price, { fromPrice = null, holdMs = 2500 } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('Invalid pulse price'), { status: 400 });
  }
  const until = Date.now() + Math.max(800, Number(holdMs) || 2500);
  const entry = {
    price: value,
    fromPrice: Number.isFinite(Number(fromPrice)) ? Number(fromPrice) : value,
    until,
    startedAt: Date.now(),
  };
  pulses.set(sym, entry);
  return entry;
}

export function clearPricePulse(symbol) {
  pulses.delete(String(symbol || '').toUpperCase());
}

export function listActivePulses() {
  const now = Date.now();
  const rows = [];
  for (const [symbol, p] of pulses) {
    if (now > p.until) {
      pulses.delete(symbol);
      continue;
    }
    rows.push({ symbol, ...p, remainingMs: p.until - now });
  }
  return rows;
}
