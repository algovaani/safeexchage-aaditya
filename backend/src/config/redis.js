/**
 * Redis clients — optional. When REDIS_URL is unset, all callers fall back to in-process memory.
 */
import Redis from 'ioredis';
import os from 'os';

let client = null;
let pubClient = null;
let subClient = null;
let marketPubClient = null;
let marketSubClient = null;
let ready = false;

export function isRedisEnabled() {
  return Boolean(process.env.REDIS_URL?.trim());
}

function buildOptions() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  return {
    url,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 8) return null;
      return Math.min(times * 200, 3000);
    },
  };
}

export async function initRedis() {
  if (!isRedisEnabled()) {
    console.info('[redis] REDIS_URL not set — using in-memory live state only');
    return false;
  }
  if (client) return ready;

  const opts = buildOptions();
  client = new Redis(opts);
  pubClient = new Redis(opts);
  subClient = new Redis(opts);
  marketPubClient = new Redis(opts);
  marketSubClient = new Redis(opts);

  const onErr = (label) => (err) => {
    if (err?.message) console.warn(`[redis] ${label}:`, err.message);
  };
  client.on('error', onErr('client'));
  pubClient.on('error', onErr('pub'));
  subClient.on('error', onErr('sub'));
  marketPubClient.on('error', onErr('market-pub'));
  marketSubClient.on('error', onErr('market-sub'));

  await Promise.all([
    new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
    }),
    new Promise((resolve, reject) => {
      pubClient.once('ready', resolve);
      pubClient.once('error', reject);
    }),
    new Promise((resolve, reject) => {
      subClient.once('ready', resolve);
      subClient.once('error', reject);
    }),
    new Promise((resolve, reject) => {
      marketPubClient.once('ready', resolve);
      marketPubClient.once('error', reject);
    }),
    new Promise((resolve, reject) => {
      marketSubClient.once('ready', resolve);
      marketSubClient.once('error', reject);
    }),
  ]);

  ready = true;
  console.info(`[redis] Connected (${process.env.REDIS_URL})`);
  return true;
}

export function getRedis() {
  return client;
}

export function getRedisPub() {
  return pubClient;
}

export function getRedisSub() {
  return subClient;
}

export function getMarketRedisPub() {
  return marketPubClient;
}

export function getMarketRedisSub() {
  return marketSubClient;
}

export function isRedisReady() {
  return ready && client?.status === 'ready';
}

export function redisInstanceId() {
  return `${process.pid}@${os.hostname()}`;
}

export async function attachSocketIoRedisAdapter(io) {
  if (!isRedisReady() || !io) return false;
  try {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    console.info('[redis] Socket.IO cluster adapter attached');
    return true;
  } catch (err) {
    console.warn('[redis] Socket.IO adapter failed:', err.message);
    return false;
  }
}

export async function shutdownRedis() {
  ready = false;
  const close = (c) => c?.quit().catch(() => c?.disconnect());
  await Promise.all([
    close(client),
    close(pubClient),
    close(subClient),
    close(marketPubClient),
    close(marketSubClient),
  ]);
  client = null;
  pubClient = null;
  subClient = null;
  marketPubClient = null;
  marketSubClient = null;
}
