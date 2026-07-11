/** REST poll for markets list / dashboard (slower — not on trade screen). */
export const LIST_MARKET_POLL_MS = 12_000;
/** REST fallback on trade/futures when socket already streams prices. */
export const TRADE_MARKET_POLL_MS = 20_000;
/** @deprecated use LIST_MARKET_POLL_MS or TRADE_MARKET_POLL_MS */
export const MARKET_POLL_MS = LIST_MARKET_POLL_MS;
/** Order book REST fallback — socket depth is primary on trade page. */
export const DEPTH_POLL_MS = 10_000;
/** Live clock tick (UI only). */
export const CLOCK_TICK_MS = 1_000;
