import { ManualPriceData } from '../models/ManualPriceData.js';
import { MarketData } from '../models/MarketData.js';
import { clearPulseDepthOverlay, setPulseDepthOverlay } from './pricePulseService.js';

const INTERVALS = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'];

const INTERVAL_MS = {
  '1s': 1000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export function alignOpenTime(ms, interval) {
  const step = INTERVAL_MS[interval] || 1000;
  return Math.floor(ms / step) * step;
}

export { INTERVALS };

export function buildPulseDepth(mid, levels = 20) {
  const price = Number(mid);
  if (!(price > 0)) return { bids: [], asks: [], mid: null };

  const bids = [];
  const asks = [];
  for (let i = 1; i <= levels; i++) {
    const step = price * (0.0012 * i);
    const qty = Number((25 / i + Math.random() * 8).toFixed(4));
    bids.push({ price: Number((price - step).toFixed(8)), qty });
    asks.push({ price: Number((price + step).toFixed(8)), qty });
  }
  return { bids, asks, mid: price, pulse: true };
}

/**
 * Memory-only pulse flash (no Mongo writes). Safe for high-frequency admin pulses.
 * Order matching + sockets use this; chart restores to live Binance after holdMs.
 */
export function buildMemoryPulseFlash({ symbol, fromPrice, pulsePrice, holdMs = 1500 }) {
  const sym = String(symbol || '').toUpperCase();
  const from = Number(fromPrice);
  const to = Number(pulsePrice);
  if (!sym || !(to > 0)) {
    return { symbol: sym, candles: [], depth: null, openTimes: {}, saved: 0 };
  }

  const hi = Math.max(Number.isFinite(from) && from > 0 ? from : to, to);
  const lo = Math.min(Number.isFinite(from) && from > 0 ? from : to, to);
  const openBase = Number.isFinite(from) && from > 0 ? from : to;
  const now = Date.now();
  const depthTtlMs = Math.max(600, Math.min(Number(holdMs) || 1500, 5000));
  const depth = buildPulseDepth(to, 20);
  setPulseDepthOverlay(sym, depth, depthTtlMs);

  const openTimes = {};
  const candles = INTERVALS.map((interval) => {
    const openTime = alignOpenTime(now, interval);
    openTimes[interval] = openTime;
    return {
      interval,
      candle: {
        openTime,
        open: openBase,
        high: hi,
        low: lo,
        close: to,
        volume: 1,
        isFinal: false,
        pulse: true,
        _pulseZoom: true,
      },
    };
  });

  try {
    // Soft tick for baseline only — never record the pulse spike into live buckets
    import('./marketDataProvider.js').then(({ recordPriceTick }) => {
      if (Number.isFinite(from) && from > 0) recordPriceTick(sym, from);
    }).catch(() => {});
  } catch {
    /* ignore */
  }

  return { symbol: sym, candles, depth, openTimes, saved: 0 };
}

/**
 * Persist pulse wick so it survives page refresh.
 * Manual tick expands high/low via mergeCandles; close stays market (applyClose not set).
 */
export async function persistPulseWick({
  symbol,
  fromPrice,
  pulsePrice,
  openTimes,
  adminId,
}) {
  const sym = String(symbol || '').toUpperCase();
  const to = Number(pulsePrice);
  const from = Number(fromPrice);
  if (!sym || !(to > 0)) return { saved: 0 };

  const hi = Math.max(Number.isFinite(from) && from > 0 ? from : to, to);
  const lo = Math.min(Number.isFinite(from) && from > 0 ? from : to, to);
  let saved = 0;
  let manuals = 0;

  // createdBy is required on ManualPriceData — resolve a writer id
  let writerId = adminId || null;
  if (!writerId) {
    try {
      const { User } = await import('../models/User.js');
      const admin = await User.findOne({ role: 'admin' }).select('_id').lean();
      writerId = admin?._id || null;
    } catch {
      /* ignore */
    }
  }

  for (const interval of INTERVALS) {
    if (interval === '1s') continue;
    const openTime = openTimes?.[interval] ?? alignOpenTime(Date.now(), interval);

    if (writerId) {
      try {
        await ManualPriceData.findOneAndUpdate(
          { symbol: sym, interval, openTime, mode: 'tick', price: to },
          {
            $set: {
              symbol: sym,
              interval,
              openTime,
              mode: 'tick',
              price: to,
              tickTime: Date.now(),
              high: hi,
              low: lo,
              createdBy: writerId,
            },
            $inc: { revision: 1 },
          },
          { upsert: true }
        );
        manuals += 1;
      } catch (err) {
        console.warn(`[pulse] manual wick ${sym} ${interval}:`, err.message);
      }
    } else {
      console.warn(`[pulse] no adminId — MarketData wick only for ${sym} ${interval}`);
    }

    const existing = await MarketData.findOne({ symbol: sym, interval, openTime }).lean();
    const open =
      existing && Number(existing.open) > 0 ? Number(existing.open) : hi === to ? from || to : from || to;
    const close =
      existing && Number(existing.close) > 0
        ? Number(existing.close)
        : Number.isFinite(from) && from > 0
          ? from
          : to;

    await MarketData.findOneAndUpdate(
      { symbol: sym, interval, openTime },
      {
        $set: {
          open: open > 0 ? open : from || to,
          // Keep market close in DB — pulse is only a wick (manual tick + high/low)
          close: close > 0 ? close : from || to,
          isFinal: false,
          source: 'binance',
        },
        $max: {
          high: Math.max(hi, open || 0, close || 0, to),
          volume: Math.max(Number(existing?.volume) || 0, 1),
        },
        $min: { low: Math.min(lo, open > 0 ? open : lo, close > 0 ? close : lo, to) },
        $setOnInsert: {
          symbol: sym,
          interval,
          openTime,
        },
      },
      { upsert: true }
    );
    saved += 1;
  }

  return { saved, manuals };
}

/**
 * After pulse flash: restore live close, KEEP pulse wick in MarketData + ManualPriceData
 * so refresh still shows the spike and live graph continues from market mid.
 */
export async function finalizePulseAfterRevert(
  symbol,
  marketPrice,
  { openTimes, pulsedPrice, fromPrice, adminId } = {}
) {
  const sym = String(symbol || '').toUpperCase();
  const px = Number(marketPrice);
  const pulse = Number(pulsedPrice);
  const from = Number(fromPrice);
  clearPulseDepthOverlay(sym);
  if (!sym || !(px > 0)) return { restored: 0 };

  const { fetchKlines } = await import('./marketDataProvider.js');

  // Ensure wick manuals stay (do NOT delete extreme pulse ticks)
  if (pulse > 0) {
    await persistPulseWick({
      symbol: sym,
      fromPrice: Number.isFinite(from) && from > 0 ? from : px,
      pulsePrice: pulse,
      openTimes,
      adminId,
    });
  }

  let restored = 0;
  for (const interval of INTERVALS) {
    const openTime = openTimes?.[interval] ?? alignOpenTime(Date.now(), interval);
    if (interval === '1s') {
      await MarketData.findOneAndUpdate(
        { symbol: sym, interval, openTime },
        {
          $set: { close: px, isFinal: false, source: 'binance' },
          $max: { high: Math.max(px, pulse || 0, from || 0) },
          $min: { low: Math.min(px, pulse > 0 ? pulse : px, from > 0 ? from : px) },
          $setOnInsert: {
            symbol: sym,
            interval,
            openTime,
            open: px,
          },
        },
        { upsert: true }
      );
      restored += 1;
      continue;
    }

    try {
      const external = await fetchKlines(sym, interval, { limit: 5 });
      if (external?.length) {
        // Expand-only persist — never force-wipe pulse wick
        const { persistMarketKlines } = await import('./marketDataService.js');
        const bars = external.map((c, i) => {
          if (i !== external.length - 1) return c;
          return {
            ...c,
            high: Math.max(Number(c.high) || 0, px, pulse || 0, from || 0),
            low: Math.min(
              Number(c.low) > 0 ? Number(c.low) : px,
              px,
              pulse > 0 ? pulse : px,
              from > 0 ? from : px
            ),
            close: px,
          };
        });
        await persistMarketKlines(sym, interval, bars, 'binance');
        restored += bars.length;
      } else {
        await MarketData.findOneAndUpdate(
          { symbol: sym, interval, openTime },
          {
            $set: { close: px, isFinal: false, source: 'binance' },
            $max: { high: Math.max(px, pulse || 0, from || 0) },
            $min: { low: Math.min(px, pulse > 0 ? pulse : px, from > 0 ? from : px) },
            $setOnInsert: {
              symbol: sym,
              interval,
              openTime,
              open: from > 0 ? from : px,
            },
          },
          { upsert: true }
        );
        restored += 1;
      }
    } catch {
      await MarketData.findOneAndUpdate(
        { symbol: sym, interval, openTime },
        {
          $set: { close: px, isFinal: false, source: 'binance' },
          $max: { high: Math.max(px, pulse || 0, from || 0) },
          $min: { low: Math.min(px, pulse > 0 ? pulse : px, from > 0 ? from : px) },
          $setOnInsert: {
            symbol: sym,
            interval,
            openTime,
            open: from > 0 ? from : px,
          },
        },
        { upsert: true }
      );
      restored += 1;
    }
  }

  // Re-stamp wick AFTER Binance sync so refresh always shows the spike
  if (pulse > 0) {
    await persistPulseWick({
      symbol: sym,
      fromPrice: Number.isFinite(from) && from > 0 ? from : px,
      pulsePrice: pulse,
      openTimes,
      adminId,
    });
  }

  return { restored };
}

export async function clearPulseChartArtifacts(symbol, marketPrice, opts = {}) {
  return finalizePulseAfterRevert(symbol, marketPrice, opts);
}

/**
 * Repair chart DB for a symbol: pull fresh Binance history (force overwrite).
 */
export async function repairMarketChartFromExchange(symbol, { limit = 500 } = {}) {
  const { fetchKlines } = await import('./marketDataProvider.js');
  const { persistMarketKlinesForce } = await import('./marketDataService.js');

  const sym = String(symbol || '').toUpperCase();
  if (!sym) return { repaired: 0 };

  await ManualPriceData.deleteMany({ symbol: sym });
  await MarketData.deleteMany({ symbol: sym, source: 'pulse' });

  let repaired = 0;
  for (const interval of INTERVALS) {
    if (interval === '1s') continue;
    try {
      const external = await fetchKlines(sym, interval, { limit });
      await persistMarketKlinesForce(sym, interval, external, 'binance');
      repaired += external.length;
    } catch (err) {
      console.warn(`[repair] ${sym} ${interval}:`, err.message);
    }
  }
  return { repaired };
}

/**
 * Temporary pulse flash in MarketData (source:'pulse').
 * Extreme wick is removed on finalize — order matching uses in-memory from→to path.
 */
export async function persistPulseMarketHistory({
  symbol,
  fromPrice,
  pulsePrice,
  adminId,
  holdMs = 1500,
}) {
  const sym = String(symbol || '').toUpperCase();
  const from = Number(fromPrice);
  const to = Number(pulsePrice);
  if (!sym || !(to > 0)) return { saved: 0 };

  const { recordPriceTick } = await import('./marketDataProvider.js');

  const hi = Math.max(Number.isFinite(from) && from > 0 ? from : to, to);
  const lo = Math.min(Number.isFinite(from) && from > 0 ? from : to, to);
  const now = Date.now();
  const openBase = Number.isFinite(from) && from > 0 ? from : to;

  for (let i = 0; i < 3; i++) recordPriceTick(sym, to);
  if (Number.isFinite(from) && from > 0) recordPriceTick(sym, from);

  const depthTtlMs = Math.max(600, Math.min(Number(holdMs) || 1500, 5000));
  const depth = buildPulseDepth(to, 20);
  setPulseDepthOverlay(sym, depth, depthTtlMs);

  const openTimes = {};
  let saved = 0;
  const candles = [];

  for (const interval of INTERVALS) {
    const openTime = alignOpenTime(now, interval);
    openTimes[interval] = openTime;

    const existing = await MarketData.findOne({ symbol: sym, interval, openTime }).lean();
    // Keep real open for the bar; only flash high/low/close for the pulse window
    const open =
      existing && Number(existing.open) > 0 && existing.source !== 'pulse'
        ? Number(existing.open)
        : openBase;
    const high = Math.max(Number(existing?.high) || 0, hi, open, to);
    const low = Math.min(
      Number(existing?.low) > 0 && existing?.source !== 'pulse' ? Number(existing.low) : lo,
      lo,
      open,
      to
    );

    const doc = await MarketData.findOneAndUpdate(
      { symbol: sym, interval, openTime },
      {
        $set: {
          open,
          high,
          low,
          close: to,
          isFinal: false,
          source: 'pulse',
          volume: Math.max(Number(existing?.volume) || 0, 1),
        },
      },
      { upsert: true, new: true }
    ).lean();

    saved += 1;
    candles.push({
      interval,
      candle: {
        openTime,
        open: doc.open,
        high: doc.high,
        low: doc.low,
        close: doc.close,
        volume: doc.volume || 1,
        isFinal: false,
        pulse: true,
      },
    });
  }

  return {
    saved,
    depth,
    high: hi,
    low: lo,
    openTimes,
    candles,
    adminId: adminId || null,
  };
}
