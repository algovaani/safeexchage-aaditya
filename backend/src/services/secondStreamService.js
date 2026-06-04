import WebSocket from 'ws';
import { loadManualForRange, mergeCandles } from './mergeService.js';
import { processOrdersForPrice } from './orderEngine.js';

const WS_BASE = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';

/** @type {Map<string, { openTime: number, open: number, high: number, low: number, close: number, volume: number }>} */
const aggState = new Map();

function throttleByKey(fn, ms) {
  const last = new Map();
  return (key, ...args) => {
    const now = Date.now();
    if (now - (last.get(key) || 0) < ms) return;
    last.set(key, now);
    return fn(...args);
  };
}

const emitMergedThrottled = throttleByKey(
  async (io, room, symbol, interval, candle) => {
    const manual = await loadManualForRange(symbol, interval, candle.openTime, candle.openTime);
    const [merged] = mergeCandles([candle], manual);
    if (!merged) return;
    io.to(room).emit('market:klines:merged', {
      symbol,
      interval,
      candle: merged,
    });
    await processOrdersForPrice(symbol, merged.close);
  },
  80
);

/**
 * Aggregate Binance @trade into 1-second OHLCV and merge with manual_price_data (interval 1s).
 */
export function startBinanceSecondTradeStream({ symbol, io }) {
  const sym = symbol.toUpperCase();
  const stream = `${sym.toLowerCase()}@trade`;
  const url = `${WS_BASE}/${stream}`;
  const room = `m:${sym}:1s`;
  const key = sym;

  let ws;
  let stopped = false;

  const recent = [];
  const MAX_RECENT = 48;

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(url);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.e !== 'trade') return;
        const price = parseFloat(msg.p);
        const qty = parseFloat(msg.q);
        const T = msg.T;
        const bucket = Math.floor(T / 1000) * 1000;

        let st = aggState.get(key);
        if (!st || st.openTime !== bucket) {
          st = {
            openTime: bucket,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: qty,
          };
          aggState.set(key, st);
        } else {
          st.high = Math.max(st.high, price);
          st.low = Math.min(st.low, price);
          st.close = price;
          st.volume += qty;
        }

        const candle = {
          openTime: st.openTime,
          open: st.open,
          high: st.high,
          low: st.low,
          close: st.close,
          volume: st.volume,
          isFinal: false,
        };

        emitMergedThrottled(key, io, room, sym, '1s', candle);

        const tape = { price, qty, time: T, symbol: sym, isBuyerMaker: msg.m === true };
        recent.unshift(tape);
        if (recent.length > MAX_RECENT) recent.pop();
        io.to(room).emit('market:trade', tape);
      } catch (e) {
        console.error('secondStream trade error', e.message);
      }
    });

    ws.on('close', () => {
      if (!stopped) setTimeout(connect, 3_000);
    });
    ws.on('error', () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  };

  connect();

  return () => {
    stopped = true;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    aggState.delete(key);
  };
}

/**
 * Binance partial depth 20 @ 100ms → order book UI.
 */
export function startBinanceDepthStream({ symbol, io }) {
  const sym = symbol.toUpperCase();
  const stream = `${sym.toLowerCase()}@depth20@100ms`;
  const url = `${WS_BASE}/${stream}`;
  const room = `m:${sym}:1s`;

  let ws;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(url);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const bidsRaw = msg.bids || msg.b || [];
        const asksRaw = msg.asks || msg.a || [];
        const bids = bidsRaw.slice(0, 14).map(([p, q]) => ({
          price: parseFloat(p),
          qty: parseFloat(q),
        }));
        const asks = asksRaw.slice(0, 14).map(([p, q]) => ({
          price: parseFloat(p),
          qty: parseFloat(q),
        }));
        const mid =
          asks[0] && bids[0] ? (asks[0].price + bids[0].price) / 2 : asks[0]?.price || bids[0]?.price || null;
        io.to(room).emit('market:depth', { symbol: sym, bids, asks, mid });
      } catch (e) {
        console.error('depth stream error', e.message);
      }
    });

    ws.on('close', () => {
      if (!stopped) setTimeout(connect, 3_000);
    });
    ws.on('error', () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  };

  connect();

  return () => {
    stopped = true;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };
}
