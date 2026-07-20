/**
 * One-shot admin price pulses: spike chart + depth once, then revert to market.
 */
const pulses = new Map();
const depthOverlays = new Map();
const revertTimers = new Map();

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
 * Hold pulsed price briefly so UI shows one spike, then auto-clear.
 */
export function setPricePulse(symbol, price, { fromPrice = null, holdMs = 1500 } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('Invalid pulse price'), { status: 400 });
  }
  const hold = Math.max(600, Math.min(Number(holdMs) || 1500, 5000));
  const until = Date.now() + hold;
  const entry = {
    price: value,
    fromPrice: Number.isFinite(Number(fromPrice)) ? Number(fromPrice) : value,
    until,
    startedAt: Date.now(),
    holdMs: hold,
  };
  pulses.set(sym, entry);
  return entry;
}

export function clearPricePulse(symbol) {
  const sym = String(symbol || '').toUpperCase();
  pulses.delete(sym);
  const t = revertTimers.get(sym);
  if (t) {
    clearTimeout(t);
    revertTimers.delete(sym);
  }
}

export function setPulseDepthOverlay(symbol, depth, ttlMs = 1500) {
  const sym = String(symbol || '').toUpperCase();
  if (!depth?.bids?.length && !depth?.asks?.length) return;
  const ttl = Math.max(600, Math.min(Number(ttlMs) || 1500, 5000));
  depthOverlays.set(sym, {
    ...depth,
    until: Date.now() + ttl,
  });
}

export function clearPulseDepthOverlay(symbol) {
  depthOverlays.delete(String(symbol || '').toUpperCase());
}

/** @returns {{ bids: any[], asks: any[], mid: number|null, pulse?: boolean } | null} */
export function getPulseDepthOverlay(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const row = depthOverlays.get(sym);
  if (!row) return null;
  if (Date.now() > row.until) {
    depthOverlays.delete(sym);
    return null;
  }
  return row;
}

/**
 * After holdMs, clear pulse price/depth and run `onRevert` (push market data to sockets).
 */
export function schedulePulseRevert(symbol, holdMs, onRevert) {
  const sym = String(symbol || '').toUpperCase();
  const existing = revertTimers.get(sym);
  if (existing) clearTimeout(existing);

  const delay = Math.max(600, Math.min(Number(holdMs) || 1500, 5000));
  const timer = setTimeout(async () => {
    revertTimers.delete(sym);
    pulses.delete(sym);
    depthOverlays.delete(sym);
    try {
      await onRevert?.();
    } catch (err) {
      console.warn(`[pulse] revert ${sym}:`, err.message);
    }
  }, delay);
  timer.unref?.();
  revertTimers.set(sym, timer);
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
