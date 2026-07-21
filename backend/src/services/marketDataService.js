import { MarketData } from '../models/MarketData.js';
import { fetchKlines, fetchAggTrades, bucketTradesToSecondCandles } from './marketDataProvider.js';
import { loadManualForRange, mergeCandles } from './mergeService.js';

function toCandleDoc(c) {
  return {
    openTime: c.openTime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume) || 0,
    isFinal: c.isFinal !== false,
  };
}

/**
 * Upsert live market candle.
 * Expands high/low within a sane band; self-heals bars polluted by extreme pulses.
 */
export async function persistCandleExpand(symbol, interval, candle, source = 'binance') {
  const sym = String(symbol || '').toUpperCase();
  if (!sym || !interval || !candle?.openTime) return null;

  const openIn = Number(candle.open);
  const highIn = Number(candle.high);
  const lowIn = Number(candle.low);
  const closeIn = Number(candle.close);
  if (![openIn, highIn, lowIn, closeIn].every(Number.isFinite)) return null;

  const existing = await MarketData.findOne({
    symbol: sym,
    interval,
    openTime: candle.openTime,
  }).lean();

  // While pulse flash is active, keep pulse close — live polls only touch volume
  if (existing?.source === 'pulse' && source !== 'pulse') {
    return MarketData.findOneAndUpdate(
      { symbol: sym, interval, openTime: candle.openTime },
      {
        $set: {
          volume: Math.max(Number(existing.volume) || 0, Number(candle.volume) || 0),
          isFinal: false,
          source: 'pulse',
        },
      },
      { new: true }
    ).lean();
  }

  const band = Math.max(closeIn * 0.08, closeIn * 0.01);
  const existingHigh = Number(existing?.high);
  const existingLow = Number(existing?.low);
  const existingOpen = Number(existing?.open);
  const existingPolluted =
    (Number.isFinite(existingHigh) && existingHigh > closeIn + band) ||
    (Number.isFinite(existingLow) && existingLow > 0 && existingLow < closeIn - band);

  const open =
    !existingPolluted && existingOpen > 0 ? existingOpen : openIn;
  const high = existingPolluted
    ? Math.max(openIn, highIn, closeIn)
    : Math.max(existingHigh || 0, highIn, open, closeIn);
  const low = existingPolluted
    ? Math.min(openIn, lowIn, closeIn)
    : Math.min(
        existingLow > 0 ? existingLow : lowIn,
        lowIn,
        open,
        closeIn
      );

  return MarketData.findOneAndUpdate(
    { symbol: sym, interval, openTime: candle.openTime },
    {
      $set: {
        open,
        high,
        low,
        close: closeIn,
        volume: Math.max(Number(existing?.volume) || 0, Number(candle.volume) || 0),
        isFinal: candle.isFinal !== false,
        source,
      },
    },
    { upsert: true, new: true }
  ).lean();
}

/**
 * Bulk persist real market OHLC (overwrite).
 */
export async function persistMarketKlines(symbol, interval, candles, source = 'binance') {
  return persistMarketKlinesForce(symbol, interval, candles, source);
}

/** Force overwrite OHLC — used after pulse clear / chart repair. */
export async function persistMarketKlinesForce(symbol, interval, candles, source = 'binance') {
  const sym = String(symbol || '').toUpperCase();
  const ops = [];
  for (const c of candles || []) {
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    if (!c?.openTime || ![open, high, low, close].every(Number.isFinite)) continue;
    const hi = Math.max(open, high, close);
    const lo = Math.min(open, low, close);
    ops.push({
      updateOne: {
        filter: { symbol: sym, interval, openTime: c.openTime },
        update: {
          $set: {
            open,
            high: hi,
            low: lo,
            close,
            volume: Number(c.volume) || 0,
            isFinal: c.isFinal !== false,
            source,
          },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await MarketData.bulkWrite(ops, { ordered: false });
}

/** @deprecated alias */
export const persistBinanceKlines = persistMarketKlines;

/**
 * Load candles from DB and merge manual/pulse overrides.
 */
export async function loadDbCandles(symbol, interval, { startTime, endTime, limit = 500 } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const lim = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const q = { symbol: sym, interval };
  if (startTime != null || endTime != null) {
    q.openTime = {};
    if (startTime != null) q.openTime.$gte = Number(startTime);
    if (endTime != null) q.openTime.$lte = Number(endTime);
  }

  const rows = await MarketData.find(q).sort({ openTime: -1 }).limit(lim).lean();
  rows.reverse();
  return rows.map(toCandleDoc);
}

/**
 * Chart source of truth:
 * 1) Pull live market → write DB (expand-merge)
 * 2) Read OHLC from DB
 * 3) Merge admin ManualPriceData / pulse ticks
 */
export async function getMergedKlines(symbol, interval, { startTime, endTime, limit = 500 } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const lim = Math.min(Math.max(Number(limit) || 500, 1), 1000);

  // Always ingest latest market into DB first
  try {
    if (interval === '1s') {
      const trades = await fetchAggTrades(sym, { limit: 1000 });
      const external = bucketTradesToSecondCandles(trades, Math.min(lim, 600));
      await persistMarketKlines(sym, interval, external, 'binance');
    } else {
      const external = await fetchKlines(sym, interval, { startTime, endTime, limit: lim });
      await persistMarketKlines(sym, interval, external, 'binance');
    }
  } catch (err) {
    console.warn(`[klines] market ingest ${sym} ${interval}:`, err.message);
  }

  let candles = await loadDbCandles(sym, interval, { startTime, endTime, limit: lim });

  // Cold start / empty DB fallback
  if (!candles.length) {
    if (interval === '1s') {
      const trades = await fetchAggTrades(sym, { limit: 1000 });
      candles = bucketTradesToSecondCandles(trades, Math.min(lim, 600));
    } else {
      candles = await fetchKlines(sym, interval, { startTime, endTime, limit: lim });
    }
    await persistMarketKlines(sym, interval, candles, 'binance');
    candles = await loadDbCandles(sym, interval, { startTime, endTime, limit: lim });
  }

  if (!candles.length) return [];

  const start = candles[0].openTime;
  const end = candles[candles.length - 1].openTime;
  const manual = await loadManualForRange(sym, interval, start, end);
  return mergeCandles(candles, manual);
}

/**
 * Single bucket from DB + manuals (for pulse revert / socket emit).
 */
export async function getMergedCandleAt(symbol, interval, openTime, fallbackClose) {
  const sym = String(symbol || '').toUpperCase();
  const px = Number(fallbackClose);
  let row = await MarketData.findOne({ symbol: sym, interval, openTime }).lean();
  if (!row && Number.isFinite(px) && px > 0) {
    row = {
      openTime,
      open: px,
      high: px,
      low: px,
      close: px,
      volume: 0,
      isFinal: false,
    };
  }
  if (!row) return null;
  const manual = await loadManualForRange(sym, interval, openTime, openTime);
  const [merged] = mergeCandles([toCandleDoc(row)], manual);
  return merged || null;
}
