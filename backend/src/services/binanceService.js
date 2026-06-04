import axios from 'axios';

const REST = process.env.BINANCE_REST_URL || 'https://api.binance.com';

/**
 * Fetch klines from Binance REST API.
 * @returns {Promise<Array<{openTime:number,open:number,high:number,low:number,close:number,volume:number,isFinal:boolean}>>}
 */
/**
 * Recent aggregate trades (used to build second-level candles; Binance has no 1s klines on spot).
 */
export async function fetchAggTrades(symbol, { limit = 1000 } = {}) {
  const { data } = await axios.get(`${REST}/api/v3/aggTrades`, {
    params: { symbol, limit },
    timeout: 15_000,
  });
  return data.map((t) => ({
    price: parseFloat(t.p),
    qty: parseFloat(t.q),
    time: t.T,
  }));
}

export function bucketTradesToSecondCandles(trades, maxBars = 600) {
  const bySec = new Map();
  for (const t of trades) {
    const openTime = Math.floor(t.time / 1000) * 1000;
    if (!bySec.has(openTime)) {
      bySec.set(openTime, {
        openTime,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: t.qty,
        isFinal: true,
      });
    } else {
      const c = bySec.get(openTime);
      c.high = Math.max(c.high, t.price);
      c.low = Math.min(c.low, t.price);
      c.close = t.price;
      c.volume += t.qty;
    }
  }
  const arr = [...bySec.values()].sort((a, b) => a.openTime - b.openTime);
  return arr.slice(-maxBars);
}

export async function fetchTicker24h(symbol) {
  const { data } = await axios.get(`${REST}/api/v3/ticker/24hr`, {
    params: { symbol },
    timeout: 15_000,
  });
  return {
    symbol: data.symbol,
    lastPrice: parseFloat(data.lastPrice),
    priceChange: parseFloat(data.priceChange),
    priceChangePercent: parseFloat(data.priceChangePercent),
    highPrice: parseFloat(data.highPrice),
    lowPrice: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume),
    quoteVolume: parseFloat(data.quoteVolume),
  };
}

export async function fetchKlines(symbol, interval, { startTime, endTime, limit = 500 } = {}) {
  const params = { symbol, interval, limit };
  if (startTime != null) params.startTime = startTime;
  if (endTime != null) params.endTime = endTime;

  const { data } = await axios.get(`${REST}/api/v3/klines`, { params, timeout: 15_000 });

  return data.map((row) => ({
    openTime: row[0],
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
    isFinal: true,
  }));
}

/**
 * Parse Binance combined stream kline event payload.
 */
export function parseKlineEvent(data) {
  const k = data.k;
  if (!k) return null;
  return {
    openTime: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    isFinal: k.x === true,
  };
}
