import { getMergedKlines } from '../services/marketDataService.js';
import {
  fetchAllPairPrices,
  fetchTicker,
  fetchTicker24h,
  fetchDepth,
  getPriceCacheTtlMs,
  normalizeSymbol,
} from '../services/marketDataProvider.js';
import { isBinanceWsConnected } from '../services/binanceWsService.js';
import { ensureTradingPairCache, getTradingPairSymbolsSync, listTradingPairs } from '../services/tradingPairService.js';
import { error, success } from '../utils/response.js';

export async function allPrices(_req, res, next) {
  try {
    const result = await fetchAllPairPrices();
    return success(res, result, 'Prices fetched');
  } catch (e) {
    return next(e);
  }
}

export async function livePrices(_req, res, next) {
  try {
    const result = await fetchAllPairPrices();
    const pollMs = getPriceCacheTtlMs();
    res.set('Cache-Control', 'no-store');
    return success(
      res,
      {
        ...result,
        source: result.provider || 'binance',
        pollIntervalSeconds: pollMs / 1000,
        wsConnected: isBinanceWsConnected(),
        hint: 'Live prices via Binance WebSocket + REST (matches Binance app)',
      },
      'Live prices fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function singlePrice(req, res, next) {
  try {
    await ensureTradingPairCache();
    const sym = normalizeSymbol(req.params.symbol);
    const allowed = getTradingPairSymbolsSync();
    if (!allowed.includes(sym)) {
      return error(
        res,
        `Unsupported symbol. Allowed: ${allowed.join(', ')}`,
        400
      );
    }
    const ticker = await fetchTicker(sym);
    return success(res, ticker, 'Price fetched');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function ticker24h(req, res, next) {
  try {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
    const t = await fetchTicker24h(symbol);
    return success(res, t, '24h ticker fetched');
  } catch (e) {
    return next(e);
  }
}

export async function klines(req, res, next) {
  try {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = String(req.query.interval || '1m');
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 1000);
    const endTime = req.query.endTime ? parseInt(req.query.endTime, 10) : undefined;
    const startTime = req.query.startTime ? parseInt(req.query.startTime, 10) : undefined;

    const candles = await getMergedKlines(symbol, interval, { startTime, endTime, limit });
    return success(res, { symbol, interval, candles }, 'Klines fetched');
  } catch (e) {
    return next(e);
  }
}

export async function orderBookDepth(req, res, next) {
  try {
    await ensureTradingPairCache();
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
    if (!getTradingPairSymbolsSync().includes(symbol)) {
      return error(res, 'Unsupported trading pair', 400);
    }
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const depth = await fetchDepth(symbol, { limit });
    if (!depth || (!depth.bids?.length && !depth.asks?.length)) {
      return error(res, 'Order book depth unavailable', 503);
    }
    res.set('Cache-Control', 'no-store');
    return success(res, { symbol, ...depth }, 'Depth fetched');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function activePairs(_req, res, next) {
  try {
    const rows = await listTradingPairs();
    return success(res, { pairs: rows }, 'Active trading pairs');
  } catch (e) {
    return next(e);
  }
}
