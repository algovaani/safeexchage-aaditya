/**
 * Binance WebSocket trade streams — real-time prices matching Binance exactly.
 * Uses data-stream.binance.vision (global) with stream.binance.com fallback.
 */
import WebSocket from 'ws';
import { recordPriceTick } from './coingeckoService.js';
import { ensureTradingPairCache, getActivePairsSync } from './tradingPairService.js';

const WS_HOSTS = [
  (process.env.BINANCE_WS_URL || '').replace(/\/$/, ''),
  'wss://data-stream.binance.vision',
  'wss://stream.binance.com:9443',
].filter((h, i, arr) => h && arr.indexOf(h) === i);

const MAX_STREAMS_PER_CONN = 80;
const RECONNECT_MS = 3_000;
const SYMBOL_REFRESH_MS = Number(process.env.BINANCE_WS_SYMBOL_REFRESH_MS) || 120_000;

/** @type {Map<string, { price: number, time: number }>} */
const liveBySymbol = new Map();
/** @type {Set<string>} */
const subscribedSymbols = new Set();
/** @type {Set<(payload: { symbol: string, price: number, time: number }) => void>} */
const tradeHandlers = new Set();

let ws = null;
let hostIndex = 0;
let reconnectTimer = null;
let symbolRefreshTimer = null;
let started = false;
let connecting = false;

function normalizeWsSymbol(symbol) {
  return String(symbol || '').trim().toLowerCase();
}

function binanceTradeSymbols() {
  const pairs = getActivePairsSync();
  return pairs
    .filter((p) => {
      if (p.isActive === false) return false;
      const src = p.priceSource;
      if (src === 'dexscreener' || src === 'coingecko' || src === 'commodity_inr') return false;
      if (p.priceAuto === false && Number(p.manualPrice) > 0) return false;
      return true;
    })
    .map((p) => normalizeWsSymbol(p.symbol))
    .filter(Boolean);
}

export function getWsLivePrice(symbol) {
  const row = liveBySymbol.get(normalizeWsSymbol(symbol));
  if (!row || !(row.price > 0)) return null;
  return row;
}

export function isBinanceWsConnected() {
  return ws?.readyState === WebSocket.OPEN;
}

export function onBinanceWsTrade(handler) {
  if (typeof handler !== 'function') return () => {};
  tradeHandlers.add(handler);
  return () => tradeHandlers.delete(handler);
}

function emitTrade(symbol, price, time) {
  const sym = normalizeWsSymbol(symbol);
  const p = Number(price);
  if (!sym || !(p > 0)) return;
  liveBySymbol.set(sym, { price: p, time: time || Date.now() });
  recordPriceTick(sym.toUpperCase(), p);
  const payload = { symbol: sym.toUpperCase(), price: p, time: time || Date.now() };
  for (const fn of tradeHandlers) {
    try {
      fn(payload);
    } catch {
      /* ignore listener errors */
    }
  }
}

function parseTradeMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const data = msg?.data || msg;
  if (!data || data.e !== 'trade') return;
  const sym = data.s;
  const price = Number(data.p);
  const time = Number(data.T || data.E) || Date.now();
  emitTrade(sym, price, time);
}

function wsBaseUrl() {
  const host = WS_HOSTS[hostIndex % WS_HOSTS.length];
  return `${host}/ws`;
}

function closeWs() {
  if (!ws) return;
  try {
    ws.removeAllListeners();
    ws.close();
  } catch {
    /* ignore */
  }
  ws = null;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectAndSubscribe();
  }, RECONNECT_MS);
  reconnectTimer.unref?.();
}

function subscribeAll() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const streams = [...subscribedSymbols].map((s) => `${s}@trade`);
  if (!streams.length) return;

  for (let i = 0; i < streams.length; i += MAX_STREAMS_PER_CONN) {
    const chunk = streams.slice(i, i + MAX_STREAMS_PER_CONN);
    ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: chunk, id: Date.now() + i }));
  }
}

async function refreshSymbolList() {
  await ensureTradingPairCache();
  const next = new Set(binanceTradeSymbols());
  const changed =
    next.size !== subscribedSymbols.size || [...next].some((s) => !subscribedSymbols.has(s));
  subscribedSymbols.clear();
  for (const s of next) subscribedSymbols.add(s);
  if (changed && isBinanceWsConnected()) subscribeAll();
}

function connectAndSubscribe() {
  if (connecting || (ws && ws.readyState === WebSocket.OPEN)) return;
  connecting = true;
  closeWs();

  const url = wsBaseUrl();
  try {
    ws = new WebSocket(url);
  } catch (err) {
    connecting = false;
    hostIndex += 1;
    console.warn('[binance-ws] connect failed:', err.message);
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    connecting = false;
    console.info(`[binance-ws] connected (${url}) — ${subscribedSymbols.size} symbol(s)`);
    subscribeAll();
  });

  ws.on('message', (buf) => parseTradeMessage(buf.toString()));

  ws.on('close', () => {
    connecting = false;
    ws = null;
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    connecting = false;
    if (hostIndex === 0) {
      console.warn('[binance-ws] error:', err.message);
    }
    hostIndex += 1;
    closeWs();
    scheduleReconnect();
  });
}

export async function startBinanceWsPriceFeed() {
  if (started) return;
  started = true;
  await refreshSymbolList();
  connectAndSubscribe();
  symbolRefreshTimer = setInterval(() => {
    refreshSymbolList().catch((err) => console.warn('[binance-ws] symbol refresh:', err.message));
  }, SYMBOL_REFRESH_MS);
  symbolRefreshTimer.unref?.();
}

export function stopBinanceWsPriceFeed() {
  started = false;
  if (symbolRefreshTimer) clearInterval(symbolRefreshTimer);
  symbolRefreshTimer = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  closeWs();
}

/** Merge WS live prices into ticker rows (price only — 24h stats from REST). */
export function applyWsPriceToRow(row) {
  if (!row?.symbol) return row;
  const live = getWsLivePrice(row.symbol);
  if (!live || !(live.price > 0)) return row;
  const price = live.price;
  const high = Number(row.high_24h);
  const low = Number(row.low_24h);
  return {
    ...row,
    price,
    lastPrice: price,
    ws_live: true,
    ws_updated_at: new Date(live.time).toISOString(),
    high_24h: Number.isFinite(high) && high > 0 ? Math.max(high, price) : price,
    low_24h: Number.isFinite(low) && low > 0 ? Math.min(low, price) : price,
  };
}
