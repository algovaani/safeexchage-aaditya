const INTERVAL_MS = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export function intervalToMs(interval) {
  return INTERVAL_MS[interval] ?? 60_000;
}

export function alignOpenTime(ts, interval) {
  const step = intervalToMs(interval);
  return Math.floor(ts / step) * step;
}
