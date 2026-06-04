import WebSocket from 'ws';
import { parseKlineEvent } from './binanceService.js';
import { MarketData } from '../models/MarketData.js';
import { loadManualForRange, mergeCandles } from './mergeService.js';
import { processOrdersForPrice } from './orderEngine.js';
import { startBinanceSecondTradeStream, startBinanceDepthStream } from './secondStreamService.js';

const WS_BASE = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';

const activeStreams = new Map();

/**
 * Single-symbol kline stream; reconnects on close.
 */
export function startBinanceKlineStream({ symbol, interval, io }) {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  const url = `${WS_BASE}/${stream}`;

  let ws;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(url);

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.e !== 'kline') return;
        const k = parseKlineEvent(msg);
        if (!k) return;

        await MarketData.findOneAndUpdate(
          { symbol: symbol.toUpperCase(), interval, openTime: k.openTime },
          {
            $set: {
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
              volume: k.volume,
              isFinal: k.isFinal,
              source: 'binance',
            },
          },
          { upsert: true }
        );

        const manual = await loadManualForRange(
          symbol.toUpperCase(),
          interval,
          k.openTime,
          k.openTime
        );
        const [merged] = mergeCandles([k], manual);
        if (!merged) return;

        const room = roomName(symbol, interval);
        io.to(room).emit('market:klines:merged', { symbol: symbol.toUpperCase(), interval, candle: merged });

        await processOrdersForPrice(symbol.toUpperCase(), merged.close);
      } catch (e) {
        console.error('marketStream message error', e.message);
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

export function roomName(symbol, interval) {
  return `m:${symbol.toUpperCase()}:${interval}`;
}

export function ensureMarketStream(io, symbol, interval) {
  const sym = symbol.toUpperCase();
  const key = `${sym}|${interval}`;
  if (activeStreams.has(key)) return;

  if (interval === '1s') {
    const stopTrade = startBinanceSecondTradeStream({ symbol: sym, io });
    const stopDepth = startBinanceDepthStream({ symbol: sym, io });
    activeStreams.set(key, () => {
      stopTrade();
      stopDepth();
    });
    return;
  }

  const stop = startBinanceKlineStream({ symbol: sym, interval, io });
  activeStreams.set(key, stop);
}
