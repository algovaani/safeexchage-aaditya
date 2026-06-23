import { getMergedKlines } from '../services/marketDataService.js';
import {
  fetchAllPairPrices,
  fetchTicker,
  fetchTicker24h,
  normalizeSymbol,
} from '../services/binanceService.js';
import { TRADING_PAIR_SYMBOLS } from '../config/tradingPairs.js';
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
    res.set('Cache-Control', 'no-store');
    return success(
      res,
      {
        ...result,
        pollIntervalSeconds: 0.5,
        hint: 'Poll this endpoint every 500ms for near-live updates',
      },
      'Live prices fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function singlePrice(req, res, next) {
  try {
    const sym = normalizeSymbol(req.params.symbol);
    if (!TRADING_PAIR_SYMBOLS.includes(sym)) {
      return error(
        res,
        `Unsupported symbol. Allowed: ${TRADING_PAIR_SYMBOLS.join(', ')}`,
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
