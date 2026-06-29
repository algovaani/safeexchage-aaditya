import mongoose from 'mongoose';
import { resolveMongoUri } from './resolveMongoUri.js';

const CONNECT_OPTS = {
  serverSelectionTimeoutMS: 15_000,
  socketTimeoutMS: 45_000,
  maxPoolSize: 10,
  retryWrites: true,
};

let resolvedUri = null;
let reconnectTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attachConnectionEvents() {
  const conn = mongoose.connection;
  if (conn.__safexEventsAttached) return;
  conn.__safexEventsAttached = true;

  conn.on('disconnected', () => {
    console.warn('[mongodb] disconnected');
    scheduleReconnect();
  });

  conn.on('error', (err) => {
    console.error('[mongodb] connection error:', err.message);
  });

  conn.on('reconnected', () => {
    console.info('[mongodb] reconnected');
  });
}

function scheduleReconnect() {
  if (!resolvedUri || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (mongoose.connection.readyState === 1) return;
    try {
      console.info('[mongodb] reconnecting…');
      await mongoose.connect(resolvedUri, CONNECT_OPTS);
      console.info('[mongodb] reconnect succeeded');
    } catch (err) {
      console.error('[mongodb] reconnect failed:', err.message);
      scheduleReconnect();
    }
  }, 5_000);
  reconnectTimer.unref?.();
}

export async function connectDb(uri, { attempts = 5 } = {}) {
  mongoose.set('strictQuery', true);
  resolvedUri = await resolveMongoUri(uri);
  attachConnectionEvents();

  let lastErr;
  const max = Math.max(1, Number(attempts) || 1);

  for (let i = 1; i <= max; i += 1) {
    try {
      await mongoose.connect(resolvedUri, CONNECT_OPTS);
      return mongoose.connection;
    } catch (err) {
      lastErr = err;
      console.error(`[mongodb] connect attempt ${i}/${max} failed:`, err.message);
      if (i < max) await sleep(Math.min(3_000 * i, 15_000));
    }
  }

  scheduleReconnect();
  throw lastErr;
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
