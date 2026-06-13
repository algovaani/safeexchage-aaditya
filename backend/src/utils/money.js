/** Round for API responses (2 dp) */
export function roundMoney(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** Store with higher precision (8 dp) */
export function storeMoney(value) {
  return roundMoney(value, 8);
}
