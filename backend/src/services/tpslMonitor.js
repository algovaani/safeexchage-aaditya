import { AdminTrade } from '../models/AdminTrade.js';
import { fetchPriceMap } from './coingeckoService.js';
import { settleAllOrdersForTrade } from './settlementService.js';

const INTERVAL_MS = 30_000;
let timer = null;
let running = false;

async function checkTpSl() {
  if (running) return;
  running = true;

  try {
    const trades = await AdminTrade.find({ status: 'open' }).populate('pairId', 'symbol displayPair');
    if (!trades.length) return;

    const { prices, stale } = await fetchPriceMap({ force: true });
    if (stale) {
      console.warn('[tpslMonitor] Using stale CoinGecko prices for TP/SL check');
    }

    for (const trade of trades) {
      const symbol = trade.pairId?.symbol;
      if (!symbol) continue;

      const currentPrice = prices[symbol];
      if (currentPrice == null) continue;

      let reason = null;
      if (currentPrice >= trade.takeProfit) reason = 'TP';
      else if (currentPrice <= trade.stopLoss) reason = 'SL';

      if (!reason) continue;

      try {
        const result = await settleAllOrdersForTrade(trade._id, currentPrice);
        console.log(
          `[tpslMonitor] Trade #${trade._id} settled at price ${currentPrice} — ${reason} hit (${result.settled_count} orders)`
        );
      } catch (err) {
        console.error(`[tpslMonitor] Failed to settle trade #${trade._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[tpslMonitor] Error:', err.message);
  } finally {
    running = false;
  }
}

export function startMonitor() {
  if (timer) return;
  console.log('[tpslMonitor] Starting TP/SL monitor (every 30s)');
  timer = setInterval(checkTpSl, INTERVAL_MS);
  checkTpSl().catch(() => {});
}

export function stopMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
