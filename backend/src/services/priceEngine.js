/**
 * Price Engine — single source of truth for live market prices.
 *
 * Binance WS/REST → effectivePrice (with admin override layer) → Socket.IO / trading.
 * No MongoDB on the hot path.
 */
import { getWsLivePrice } from './binanceWsService.js';
import { getActivePulse } from './pricePulseService.js';
import { getPairSync } from './tradingPairService.js';
import {
  setLivePrice,
  setLivePriceLocal,
  getLivePriceLocal,
  getAllLivePricesLocal,
} from './liveStateStore.js';

function saveState(symbol, row) {
  const sym = String(symbol || '').toUpperCase();
  const entry = {
    binancePrice: row.binancePrice ?? null,
    effectivePrice: row.effectivePrice ?? null,
    source: row.source || 'binance',
    timestamp: Date.now(),
    ...(row.fromPrice != null ? { fromPrice: row.fromPrice } : {}),
  };
  if (entry.effectivePrice > 0) {
    setLivePriceLocal(sym, entry);
    setLivePrice(sym, entry);
  }
  return entry;
}

/**
 * Resolve effective price for a symbol.
 * Priority: manual pair price → active pulse → Binance WS/REST.
 */
export function resolveEffectivePrice(symbol, binancePrice = null) {
  const sym = String(symbol || '').toUpperCase();
  let binance = Number(binancePrice);
  if (!(binance > 0)) {
    const ws = getWsLivePrice(sym);
    if (ws?.price > 0) binance = ws.price;
  }

  const pair = getPairSync(sym);
  if (pair?.priceAuto === false && Number(pair.manualPrice) > 0) {
    return saveState(sym, {
      binancePrice: binance > 0 ? binance : null,
      effectivePrice: Number(pair.manualPrice),
      source: 'manual',
    });
  }

  const pulse = getActivePulse(sym);
  if (pulse?.price > 0) {
    return saveState(sym, {
      binancePrice: binance > 0 ? binance : pulse.fromPrice,
      effectivePrice: pulse.price,
      source: 'pulse',
      fromPrice: pulse.fromPrice,
    });
  }

  const effective = binance > 0 ? binance : null;
  return saveState(sym, {
    binancePrice: binance > 0 ? binance : null,
    effectivePrice: effective,
    source: 'binance',
  });
}

/** Latest cached live price state (no network). */
export function getLivePriceState(symbol) {
  return getLivePriceLocal(String(symbol || '').toUpperCase());
}

/** Effective price only — convenience for order matching. */
export function getEffectivePrice(symbol) {
  return getLivePriceState(symbol)?.effectivePrice ?? null;
}

/** Called on every Binance WS trade tick. */
export function onBinanceTrade(symbol, price) {
  return resolveEffectivePrice(symbol, price);
}

/** Snapshot of all in-memory live prices (for diagnostics / bulk APIs). */
export function getAllLivePriceStates() {
  return getAllLivePricesLocal();
}
