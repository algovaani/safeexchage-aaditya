/**
 * Heavy / periodic work that must NOT share the HTTP event loop under load.
 * Start only from worker.js (or PROCESS_ROLE=all in local/dev).
 */
import { startMonitor, stopMonitor } from '../services/tpslMonitor.js';
import { startFuturesMonitor, stopFuturesMonitor, attachFuturesMonitorIo } from '../services/futuresMonitor.js';
import {
  startSpotOrderMonitor,
  stopSpotOrderMonitor,
  attachSpotOrderMonitorIo,
} from '../services/spotOrderMonitor.js';
import { startStakingCron, stopStakingCron } from '../services/stakingRewardService.js';
import { seedTradingPairsIfEmpty, refreshTradingPairCache, ensureCommodityPairs } from '../services/tradingPairService.js';
import { repairMisCreditedNativeDeposits } from '../services/depositService.js';
import { backfillReferralBonusBalances } from '../services/referralRewardService.js';
import { migrateAllWalletBuckets } from '../services/walletBucketService.js';
import { reconcileAllSellAssetLocks } from '../services/sellLockRepairService.js';
import { preloadLiquidityUser } from '../services/orderEngine.js';
import { isRedisEnabled } from '../config/redis.js';

/**
 * @param {{ io?: import('socket.io').Server | null }} [opts]
 * io is optional — worker process has no Socket.IO; DB settlements still run,
 * realtime pushes are skipped (emit* helpers already guard on falsy io).
 */
export async function startBackgroundJobs({ io = null } = {}) {
  if (io) {
    attachFuturesMonitorIo(io);
    attachSpotOrderMonitorIo(io);
  }

  startMonitor();
  startFuturesMonitor();
  startSpotOrderMonitor();
  startStakingCron();

  // Auto on-chain scanners (Moralis / TronGrid) removed — deposits are admin-credited.
  // Hook future chain scanners here so they stay off the API process:
  //   startMoralisScanner();
  //   startTronScanner();
  console.info('[jobs] Background monitors started (TP/SL, futures, staking)');
  console.info('[deposits] Auto on-chain detect disabled — admin credits wallets manually');

  try {
    await seedTradingPairsIfEmpty();
    await ensureCommodityPairs();
    await refreshTradingPairCache();
    console.info('[pairs] Trading pair cache loaded');

    try {
      const { repaired, scanned } = await repairMisCreditedNativeDeposits();
      if (repaired > 0) {
        console.info(`[deposits] Repaired ${repaired} native crypto deposit(s) (scanned ${scanned})`);
      }
    } catch (err) {
      console.warn('[deposits] Native deposit repair skipped:', err.message);
    }

    try {
      const { updated, scanned } = await backfillReferralBonusBalances();
      if (updated > 0) {
        console.info(`[referral] Backfilled bonusBalance for ${updated} wallet(s) (scanned ${scanned})`);
      }
    } catch (err) {
      console.warn('[referral] Bonus backfill skipped:', err.message);
    }

    try {
      const { updated, scanned } = await migrateAllWalletBuckets();
      if (updated > 0) {
        console.info(`[wallet] Migrated bucket balances for ${updated} wallet(s) (scanned ${scanned})`);
      }
    } catch (err) {
      console.warn('[wallet] Bucket migration skipped:', err.message);
    }

    try {
      const { fixed } = await reconcileAllSellAssetLocks();
      if (fixed > 0) {
        console.info(`[orders] Reconciled stuck sell locks for ${fixed} asset row(s)`);
      }
    } catch (err) {
      console.warn('[orders] Sell lock reconcile skipped:', err.message);
    }

    try {
      await preloadLiquidityUser();
    } catch {
      /* ignore */
    }

    if (!isRedisEnabled()) {
      try {
        const { startBinanceWsPriceFeed } = await import('../services/binanceWsService.js');
        await startBinanceWsPriceFeed();
      } catch (err) {
        console.warn('[binance-ws] Feed start skipped:', err.message);
      }
    }
  } catch (err) {
    console.warn('[pairs] Cache init failed:', err.message);
  }
}

export async function stopBackgroundJobs() {
  stopMonitor();
  stopFuturesMonitor();
  stopSpotOrderMonitor();
  stopStakingCron();
}
