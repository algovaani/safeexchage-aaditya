import { FuturesPosition } from '../models/FuturesPosition.js';
import { Wallet } from '../models/Wallet.js';
import { fetchPriceMap } from './marketDataProvider.js';
import { getFuturesSettings } from './futuresSettingsService.js';
import {
  closePosition,
  shouldTriggerTpSl,
  isLiquidated,
} from './futuresService.js';
import { unrealizedPnl, maintenanceMargin } from '../utils/futuresMath.js';
import { ensureWalletBuckets } from './walletAdjustmentService.js';
import { emitFuturesUpdate } from './socketService.js';
import { storeMoney } from '../utils/money.js';

const INTERVAL_MS = Number(process.env.FUTURES_MONITOR_MS) || 15_000;
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
    const walletCache = new Map();

    for (const pos of positions) {
      const mark = prices[pos.symbol];
      if (mark == null) continue;

      let liqHit = false;
      const marginMode = pos.marginMode || 'cross';

      if (marginMode === 'cross') {
        const userKey = String(pos.userId);
        let equity = walletCache.get(userKey);
        if (equity == null) {
          const wallet = await Wallet.findOne({ userId: pos.userId }).lean();
          ensureWalletBuckets(wallet);
          equity = storeMoney(wallet?.balance || 0);
          walletCache.set(userKey, equity);
        }
        const upnl = unrealizedPnl({
          side: pos.side,
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          markPrice: mark,
        });
        const maint = maintenanceMargin(pos.quantity, mark, settings.maintenanceMarginRate);
        liqHit = equity + upnl <= maint;
      } else {
        liqHit = isLiquidated({
          side: pos.side,
          markPrice: mark,
          liquidationPrice: pos.liquidationPrice,
        });
      }

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
