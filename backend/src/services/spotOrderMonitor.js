/**
 * Background scanner for open spot orders — fills must not depend on an active chart websocket.
 */
import { Order } from '../models/Order.js';
import { fetchTicker, fetchLivePriceForMatching } from './marketDataProvider.js';
import { processOrdersForPrice, notifySpotOrderFills } from './orderEngine.js';
import { getActivePulse } from './pricePulseService.js';

const INTERVAL_MS = Number(process.env.SPOT_ORDER_MONITOR_MS) || 1000;
let timer = null;
let running = false;
let ioRef = null;

export function attachSpotOrderMonitorIo(io) {
  ioRef = io;
}

async function scanOpenSpotOrders() {
  if (running) return;
  running = true;

  try {
    const symbols = await Order.distinct('symbol', {
      status: { $in: ['open', 'partially_filled'] },
    });
    if (!symbols.length) return;

    for (const symbol of symbols) {
      try {
        // Live market price for matching — never the admin pulse overlay
        const livePrice = await fetchLivePriceForMatching(symbol);

        let trades = await processOrdersForPrice(symbol, livePrice);

        const pulse = getActivePulse(symbol);
        if (pulse) {
          const fromPrice =
            Number.isFinite(pulse.fromPrice) && pulse.fromPrice > 0 ? pulse.fromPrice : livePrice;
          const pulseTrades = await processOrdersForPrice(symbol, pulse.price, {
            fromPrice,
            rangeOnly: true,
          });
          if (pulseTrades.length) trades = trades.concat(pulseTrades);
        }

        if (trades.length) {
          console.info(`[spotOrderMonitor] ${symbol}: filled ${trades.length} order(s) @ ${livePrice}`);
          await notifySpotOrderFills(ioRef, symbol, trades);
        }
      } catch (err) {
        console.warn(`[spotOrderMonitor] ${symbol}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[spotOrderMonitor] scan error:', err.message);
  } finally {
    running = false;
  }
}

export function startSpotOrderMonitor() {
  if (timer) return;
  console.log(`[spotOrderMonitor] Starting open-order scanner (every ${INTERVAL_MS}ms)`);
  timer = setInterval(() => {
    scanOpenSpotOrders().catch(() => {});
  }, INTERVAL_MS);
  timer.unref?.();
  scanOpenSpotOrders().catch(() => {});
}

export function stopSpotOrderMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
