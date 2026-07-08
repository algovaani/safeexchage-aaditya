/** Price poll interval (ms) — backend serves Binance prices (BINANCE_PRICE_CACHE_MS default 4s) */
export const MARKET_POLL_MS = 4_000;
/** Order book REST fallback when WebSocket depth is unavailable (live proxy issues). */
export const DEPTH_POLL_MS = 2_000;
