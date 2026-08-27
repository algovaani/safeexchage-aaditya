/**
 * Redis leader election — only one process runs Binance WS + order matching.
 * Worker is preferred leader when PROCESS_ROLE=worker; otherwise first API instance wins.
 */
import { getRedis, isRedisEnabled, isRedisReady, redisInstanceId } from '../config/redis.js';
import { getProcessRole } from '../config/processRole.js';

const LEADER_KEY = 'safex:market:leader';
const LEADER_TTL_SEC = 8;

let isLeader = false;
let renewTimer = null;
const instanceId = redisInstanceId();

export function isMarketLeader() {
  if (!isRedisEnabled()) return true;
  return isLeader;
}

function preferWorkerLeadership() {
  const role = getProcessRole();
  return role === 'worker' || role === 'all';
}

async function tryAcquireLeadership() {
  if (!isRedisReady()) {
    isLeader = !isRedisEnabled();
    return isLeader;
  }

  const redis = getRedis();
  const workerPreferred = preferWorkerLeadership();

  if (workerPreferred) {
    const current = await redis.get(LEADER_KEY);
    if (!current || current === instanceId) {
      await redis.set(LEADER_KEY, instanceId, 'EX', LEADER_TTL_SEC);
      isLeader = true;
      return true;
    }
    isLeader = false;
    return false;
  }

  const acquired = await redis.set(LEADER_KEY, instanceId, 'EX', LEADER_TTL_SEC, 'NX');
  if (acquired === 'OK') {
    isLeader = true;
    return true;
  }

  const current = await redis.get(LEADER_KEY);
  if (current === instanceId) {
    await redis.expire(LEADER_KEY, LEADER_TTL_SEC);
    isLeader = true;
    return true;
  }

  isLeader = false;
  return false;
}

export async function startMarketLeaderElection() {
  if (!isRedisEnabled()) {
    isLeader = true;
    return true;
  }

  await tryAcquireLeadership();
  if (renewTimer) clearInterval(renewTimer);
  renewTimer = setInterval(() => {
    tryAcquireLeadership().catch((err) => {
      console.warn('[market-leader] renew failed:', err.message);
    });
  }, LEADER_TTL_SEC * 500);
  renewTimer.unref?.();

  console.info(`[market-leader] instance=${instanceId} leader=${isLeader}`);
  return isLeader;
}

export async function stopMarketLeaderElection() {
  if (renewTimer) {
    clearInterval(renewTimer);
    renewTimer = null;
  }
  if (isRedisReady() && isLeader) {
    const redis = getRedis();
    const current = await redis.get(LEADER_KEY);
    if (current === instanceId) await redis.del(LEADER_KEY);
  }
  isLeader = false;
}
