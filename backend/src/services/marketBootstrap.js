/**
 * Bootstrap Redis + market data pipeline (shared by API and worker).
 */
import { initRedis, attachSocketIoRedisAdapter, isRedisEnabled } from '../config/redis.js';
import { startMarketLeaderElection, isMarketLeader } from './marketLeader.js';
import {
  startMarketRedisBridge,
  attachMarketWsIngest,
} from './marketRedisBridge.js';
import { initMarketStreamRedis } from './marketStreamService.js';
import { startBinanceWsPriceFeed } from './binanceWsService.js';

export async function bootstrapMarketData({ io = null } = {}) {
  await initRedis();

  if (!isRedisEnabled()) {
    try {
      await startBinanceWsPriceFeed();
    } catch (err) {
      console.warn('[market] Binance WS start skipped:', err.message);
    }
    return { redis: false, leader: true };
  }

  await startMarketLeaderElection();

  if (io) {
    await attachSocketIoRedisAdapter(io);
    initMarketStreamRedis(io);
    await startMarketRedisBridge(io);
  }

  if (isMarketLeader()) {
    try {
      await startBinanceWsPriceFeed();
      attachMarketWsIngest();
    } catch (err) {
      console.warn('[market] Leader WS start skipped:', err.message);
    }
  }

  console.info(
    `[market] Redis live state enabled — leader=${isMarketLeader()} io=${Boolean(io)} pid=${process.pid}`
  );

  return { redis: true, leader: isMarketLeader() };
}
