import { roundMoney, storeMoney } from './money.js';

/** Notional value in USDT */
export function notional(quantity, price) {
  return storeMoney(Math.abs(Number(quantity)) * Number(price));
}

/** Initial margin = notional / leverage */
export function initialMargin(quantity, price, leverage) {
  const lev = Math.max(1, Number(leverage) || 1);
  return storeMoney(notional(quantity, price) / lev);
}

/** Maintenance margin */
export function maintenanceMargin(quantity, price, maintenanceRate) {
  return storeMoney(notional(quantity, price) * Number(maintenanceRate || 0.004));
}

/** Trading fee on notional */
export function tradingFee(quantity, price, feeRate) {
  return storeMoney(notional(quantity, price) * Number(feeRate || 0.0004));
}

/** Unrealized PnL */
export function unrealizedPnl({ side, quantity, entryPrice, markPrice }) {
  const qty = Number(quantity);
  const entry = Number(entryPrice);
  const mark = Number(markPrice);
  if (!(qty > 0) || !(entry > 0) || !(mark > 0)) return 0;

  const raw = side === 'short' ? (entry - mark) * qty : (mark - entry) * qty;
  return roundMoney(raw);
}

/** ROE % */
export function roePercent(unrealized, margin) {
  const m = Number(margin);
  if (!(m > 0)) return 0;
  return roundMoney((Number(unrealized) / m) * 100);
}

/** Liquidation price estimate */
export function liquidationPrice({ side, entryPrice, quantity, margin, maintenanceRate = 0.004 }) {
  const qty = Number(quantity);
  const entry = Number(entryPrice);
  const m = Number(margin);
  if (!(qty > 0) || !(entry > 0) || !(m > 0)) return null;

  const maint = maintenanceMargin(qty, entry, maintenanceRate);
  const buffer = storeMoney(Math.max(0, m - maint));
  const delta = buffer / qty;

  const liq = side === 'short' ? entry + delta : entry - delta;
  return roundMoney(Math.max(liq, 0));
}

/** Check if mark price hit liquidation */
export function isLiquidated({ side, markPrice, liquidationPrice }) {
  const liq = Number(liquidationPrice);
  const mark = Number(markPrice);
  if (!Number.isFinite(liq) || !Number.isFinite(mark)) return false;
  if (side === 'long') return mark <= liq;
  return mark >= liq;
}

/** TP/SL trigger checks */
export function shouldTriggerTpSl({ side, markPrice, takeProfitPrice, stopLossPrice }) {
  const mark = Number(markPrice);
  const tp = takeProfitPrice != null ? Number(takeProfitPrice) : null;
  const sl = stopLossPrice != null ? Number(stopLossPrice) : null;

  if (side === 'long') {
    if (tp != null && Number.isFinite(tp) && mark >= tp) return { trigger: 'take_profit', price: tp };
    if (sl != null && Number.isFinite(sl) && mark <= sl) return { trigger: 'stop_loss', price: sl };
  } else {
    if (tp != null && Number.isFinite(tp) && mark <= tp) return { trigger: 'take_profit', price: tp };
    if (sl != null && Number.isFinite(sl) && mark >= sl) return { trigger: 'stop_loss', price: sl };
  }
  return null;
}

export function validateTpSl({ side, entryPrice, takeProfitPrice, stopLossPrice }) {
  const entry = Number(entryPrice);
  const tp = takeProfitPrice != null && takeProfitPrice !== '' ? Number(takeProfitPrice) : null;
  const sl = stopLossPrice != null && stopLossPrice !== '' ? Number(stopLossPrice) : null;

  if (tp != null && Number.isFinite(tp)) {
    if (side === 'long' && tp <= entry) return 'Take profit must be above entry for long';
    if (side === 'short' && tp >= entry) return 'Take profit must be below entry for short';
  }
  if (sl != null && Number.isFinite(sl)) {
    if (side === 'long' && sl >= entry) return 'Stop loss must be below entry for long';
    if (side === 'short' && sl <= entry) return 'Stop loss must be above entry for short';
  }
  return null;
}
