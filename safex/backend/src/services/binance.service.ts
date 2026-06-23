import WebSocket from 'ws';
import { redis } from '../lib/redis.js';

const SYMBOLS = [
  'btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt',
  'dogeusdt', 'adausdt', 'trxusdt', 'avaxusdt', 'linkusdt',
];

export type PriceTick = {
  symbol: string;
  price: string;
  change24h: string;
  high: string;
  low: string;
  volume: string;
};

let latestPrices: PriceTick[] = [];
let ws: WebSocket | null = null;

function parseTicker(symbol: string, d: Record<string, string>): PriceTick {
  return {
    symbol: symbol.toUpperCase(),
    price: d.c || d.lastPrice || '0',
    change24h: d.P || d.priceChangePercent || '0',
    high: d.h || d.highPrice || '0',
    low: d.l || d.lowPrice || '0',
    volume: d.v || d.volume || '0',
  };
}

async function cachePrice(tick: PriceTick) {
  if (redis.status === 'ready') {
    await redis.setex(`price:${tick.symbol}`, 10, JSON.stringify(tick));
  }
  const idx = latestPrices.findIndex((p) => p.symbol === tick.symbol);
  if (idx >= 0) latestPrices[idx] = tick;
  else latestPrices.push(tick);
}

export function startBinanceStream() {
  const base = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443';
  const streams = SYMBOLS.map((s) => `${s}@ticker`).join('/');
  const url = `${base}/stream?streams=${streams}`;

  function connect() {
    ws = new WebSocket(url);
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const data = msg.data || msg;
        const sym = (data.s || '').toLowerCase();
        if (!sym) return;
        const tick = parseTicker(sym, data);
        await cachePrice(tick);
      } catch {
        /* ignore parse errors */
      }
    });
    ws.on('close', () => setTimeout(connect, 5000));
    ws.on('error', () => ws?.close());
  }

  connect();
  console.log('[binance] WebSocket stream started');
}

export function getAllPrices(): PriceTick[] {
  return latestPrices.length ? [...latestPrices] : SYMBOLS.map((s) => ({
    symbol: s.toUpperCase(),
    price: '0',
    change24h: '0',
    high: '0',
    low: '0',
    volume: '0',
  }));
}

export function getPrice(symbol: string): PriceTick | null {
  const sym = symbol.toUpperCase();
  return latestPrices.find((p) => p.symbol === sym) || null;
}
