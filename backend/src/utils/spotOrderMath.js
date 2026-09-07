import { storeMoney } from './money.js';

/** Must match orderEngine / orderController fee. */
export const SPOT_FEE_RATE = 0.001;

export function orderCostUsdt(unitPriceUsdt, quantity, { feeRate = SPOT_FEE_RATE } = {}) {
  return storeMoney(Number(unitPriceUsdt) * Number(quantity) * (1 + feeRate));
}

/** Max buy qty that fits tradeable USDT (floored to 8 dp — never rounds up). */
export function maxBuyQuantity(tradeableUsdt, unitPriceUsdt, { feeRate = SPOT_FEE_RATE } = {}) {
  const bal = storeMoney(tradeableUsdt);
  const px = storeMoney(unitPriceUsdt);
  if (!(bal > 0) || !(px > 0)) return 0;
  const raw = bal / (px * (1 + feeRate));
  return storeMoney(Math.floor(raw * 1e8) / 1e8);
}
