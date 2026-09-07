/** Must match backend SPOT_FEE_RATE (0.1%). */
export const SPOT_FEE_RATE = 0.001;

/** Convert quote-currency unit price to USDT (INR pairs use platform rate). */
export function quotePriceToUsdt(unitPrice, { isInrPair = false, usdtInrRate = 0 } = {}) {
  const p = Number(unitPrice);
  if (!(p > 0)) return 0;
  if (isInrPair && Number(usdtInrRate) > 0) return p / Number(usdtInrRate);
  return p;
}

/**
 * Max buy quantity that fits tradeable USDT after fee (floors — never rounds up).
 * @param {number} marketBuffer — e.g. 1.002 for market orders (slippage vs live tick)
 */
export function maxBuyQuantity(balanceUsdt, unitPriceQuote, opts = {}) {
  const {
    isInrPair = false,
    usdtInrRate = 0,
    feeRate = SPOT_FEE_RATE,
    marketBuffer = 1,
  } = opts;
  const unitUsdt = quotePriceToUsdt(unitPriceQuote, { isInrPair, usdtInrRate });
  const bal = Number(balanceUsdt);
  if (!(bal > 0) || !(unitUsdt > 0)) return 0;
  const raw = bal / (unitUsdt * (1 + feeRate) * marketBuffer);
  return Math.floor(raw * 1e8) / 1e8;
}

export function formatSpotQty(qty) {
  if (!(qty > 0)) return '0';
  return qty.toFixed(8).replace(/\.?0+$/, '') || '0';
}
