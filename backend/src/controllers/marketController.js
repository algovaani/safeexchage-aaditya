import { getMergedKlines } from '../services/marketDataService.js';
import { fetchTicker24h } from '../services/binanceService.js';

export async function ticker24h(req, res, next) {
  try {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
    const t = await fetchTicker24h(symbol);
    res.json(t);
  } catch (e) {
    next(e);
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
    res.json({ symbol, interval, candles });
  } catch (e) {
    next(e);
  }
}
