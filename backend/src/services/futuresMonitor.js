import { FuturesPosition } from '../models/FuturesPosition.js';
import { fetchPriceMap } from './marketDataProvider.js';
import { getFuturesSettings } from './futuresSettingsService.js';
import {
  closePosition,
  shouldTriggerTpSl,
  isLiquidated,
} from './futuresService.js';
import { emitFuturesUpdate } from './socketService.js';

const INTERVAL_MS = 5_000;
let timer = null;
let running = false;
let ioRef = null;

export function attachFuturesMonitorIo(io) {
  ioRef = io;
}

async function tick({ prices: injectedPrices } = {}) {
  if (running) return;
  running = true;

  try {
    const settings = await getFuturesSettings();
    if (!settings.enabled) return;

    const positions = await FuturesPosition.find({ status: 'open' }).lean();
    if (!positions.length) return;

    const prices = injectedPrices || (await fetchPriceMap({ force: true })).prices;

    for (const pos of positions) {
      const mark = prices[pos.symbol];
      if (mark == null) continue;

      const liqHit = isLiquidated({
        side: pos.side,
        markPrice: mark,
        liquidationPrice: pos.liquidationPrice,
      });

      if (liqHit) {
        try {
          await closePosition(String(pos.userId), String(pos._id), {
            reason: 'liquidation',
            io: ioRef,
          });
          if (ioRef) {
            emitFuturesUpdate(ioRef, String(pos.userId), {
              event: 'position:liquidated',
              liquidation: { positionId: String(pos._id), symbol: pos.symbol, markPrice: mark },
            });
          }
        } catch (err) {
          console.error(`[futuresMonitor] Liquidation failed #${pos._id}:`, err.message);
        }
        continue;
      }

      const trigger = shouldTriggerTpSl({
        side: pos.side,
        markPrice: mark,
        takeProfitPrice: pos.takeProfitPrice,
        stopLossPrice: pos.stopLossPrice,
      });

      if (trigger) {
        try {
          await closePosition(String(pos.userId), String(pos._id), {
            reason: trigger.trigger,
            io: ioRef,
          });
        } catch (err) {
          console.error(`[futuresMonitor] TP/SL close failed #${pos._id}:`, err.message);
        }
        continue;
      }

      // Mark-price socket pushes removed — they caused UI flicker every 5s.
      // Positions refresh on open/close/TP/SL/liquidation events instead.
    }
  } catch (err) {
    console.error('[futuresMonitor] Error:', err.message);
  } finally {
    running = false;
  }
}

export function startFuturesMonitor() {
  if (timer) return;
  timer = setInterval(() => tick(), INTERVAL_MS);
  console.info('[futuresMonitor] Started (5s interval)');
}

export function stopFuturesMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runFuturesMonitorTick(opts) {
  return tick(opts);
}
