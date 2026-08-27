/**
 * Redis pub/sub bridge — sync live market ticks/candles across all API instances.
 * Leader publishes; every instance applies to local Socket.IO clients.
 */
import { getMarketRedisPub, getMarketRedisSub, isRedisEnabled, isRedisReady, redisInstanceId } from '../config/redis.js';
import { isMarketLeader } from './marketLeader.js';
import { onBinanceWsTrade } from './binanceWsService.js';
import { resolveEffectivePrice } from './priceEngine.js';
import { setLivePrice, setLiveCandle } from './liveStateStore.js';

const CHANNEL = process.env.REDIS_MARKET_CHANNEL || 'safex:market:events';

/** @type {import('socket.io').Server | null} */
let ioRef = null;
/** @type {((msg: object) => void) | null} */
let tickHandler = null;
/** Dedupe identical ticks on followers */
const lastTickKey = new Map();

export function setMarketTickHandler(handler) {
  tickHandler = handler;
}

export function publishMarketEvent(payload) {
  if (!payload || !isRedisReady()) return;
  const msg = { ...payload, origin: redisInstanceId(), ts: Date.now() };
  getMarketRedisPub().publish(CHANNEL, JSON.stringify(msg)).catch(() => {});
}

export function publishMarketTick({ symbol, rawPrice, state, volume = 0, pulseFill = false }) {
  publishMarketEvent({
    type: 'tick',
    symbol,
    rawPrice,
    state,
    volume,
    pulseFill,
    leader: isMarketLeader(),
  });
}

export function publishMarketCandle({ symbol, interval, candle }) {
  if (!candle) return;
  setLiveCandle(symbol, interval, candle);
  publishMarketEvent({ type: 'candle', symbol, interval, candle });
}

export function publishMarketTrade(tradePayload) {
  publishMarketEvent({ type: 'trade', trade: tradePayload });
}

export function publishMarketDepth({ symbol, depth }) {
  publishMarketEvent({ type: 'depth', symbol, depth });
}

function dedupeTick(symbol, rawPrice, ts) {
  const sym = String(symbol).toUpperCase();
  const key = `${sym}|${Math.floor(ts / 50)}|${rawPrice}`;
  if (lastTickKey.get(sym) === key) return true;
  lastTickKey.set(sym, key);
  return false;
}

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg?.type) return;

  if (msg.type === 'tick') {
    if (msg.origin === redisInstanceId()) return;
    if (dedupeTick(msg.symbol, msg.rawPrice, msg.ts)) return;
    if (msg.state) setLivePrice(msg.symbol, msg.state);
    tickHandler?.({
      symbol: msg.symbol,
      rawPrice: msg.rawPrice,
      state: msg.state,
      volume: msg.volume || 0,
      pulseFill: Boolean(msg.pulseFill),
      fromRedis: true,
      matchOrders: false,
    });
    return;
  }

  if (msg.type === 'candle' && msg.candle) {
    if (msg.origin === redisInstanceId()) return;
    setLiveCandle(msg.symbol, msg.interval, msg.candle);
    tickHandler?.({
      type: 'candle',
      symbol: msg.symbol,
      interval: msg.interval,
      candle: msg.candle,
      fromRedis: true,
    });
    return;
  }

  if (msg.type === 'trade' && msg.trade && ioRef) {
    if (msg.origin === redisInstanceId()) return;
    const sym = String(msg.trade.symbol || '').toUpperCase();
    ioRef.to(`d:${sym}`).emit('market:trade', msg.trade);
    ioRef.to(`m:${sym}:1s`).emit('market:trade', msg.trade);
    return;
  }

  if (msg.type === 'depth' && msg.depth && ioRef) {
    if (msg.origin === redisInstanceId()) return;
    const sym = String(msg.symbol || '').toUpperCase();
    ioRef.to(`d:${sym}`).emit('market:depth', { symbol: sym, ...msg.depth });
  }
}

export async function startMarketRedisBridge(io) {
  ioRef = io;
  if (!isRedisEnabled()) return false;
  if (!isRedisReady()) return false;

  const sub = getMarketRedisSub();
  await sub.subscribe(CHANNEL);
  sub.on('message', (_channel, raw) => handleMessage(raw));
  console.info(`[market-redis] Subscribed to ${CHANNEL}`);
  return true;
}

export async function stopMarketRedisBridge() {
  if (!isRedisReady()) return;
  try {
    await getMarketRedisSub().unsubscribe(CHANNEL);
  } catch {
    /* ignore */
  }
  if (wsUnsub) {
    wsUnsub();
    wsUnsub = null;
  }
  ioRef = null;
  tickHandler = null;
}

let wsUnsub = null;

/** Leader-only: Binance WS → Redis pub (worker or API leader). */
export function attachMarketWsIngest() {
  if (!isMarketLeader()) return;
  if (wsUnsub) return;

  wsUnsub = onBinanceWsTrade((payload) => {
    const sym = String(payload.symbol || '').toUpperCase();
    const state = resolveEffectivePrice(sym, payload.price);
    publishMarketTick({
      symbol: sym,
      rawPrice: payload.price,
      state,
      volume: 0,
    });
  });
  console.info('[market-redis] Binance WS ingest attached (leader)');
}
