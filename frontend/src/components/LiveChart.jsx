import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

/** @returns {import('lightweight-charts').UTCTimestamp | null} */
function toChartTime(openTime) {
  if (openTime == null) return null;
  const n = typeof openTime === 'number' ? openTime : Number(openTime);
  if (!Number.isFinite(n)) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

/** Ensure OHLC is valid for lightweight-charts (invalid bars stop rendering). */
function sanitizeOhlc(open, high, low, close) {
  const o = Number(open);
  const c = Number(close);
  if (![o, c].every(Number.isFinite)) return null;
  let h = Number(high);
  let l = Number(low);
  if (!Number.isFinite(h)) h = Math.max(o, c);
  if (!Number.isFinite(l)) l = Math.min(o, c);
  h = Math.max(h, o, c);
  l = Math.min(l, o, c);
  if (!(l > 0)) l = Math.min(o, c);
  return { open: o, high: h, low: l, close: c };
}

function toBar(c) {
  const time = toChartTime(c?.openTime ?? c?.time);
  if (time == null) return null;
  const ohlc = sanitizeOhlc(c.open, c.high, c.low, c.close);
  if (!ohlc) return null;
  return { time, ...ohlc };
}

function toVolumeBar(c, prevClose) {
  const time = toChartTime(c?.openTime ?? c?.time);
  if (time == null) return null;
  const close = Number(c.close);
  if (!Number.isFinite(close)) return null;
  const vol = Number(c.volume);
  const value = Number.isFinite(vol) && vol > 0 ? vol : Math.max(Math.abs(close - (prevClose ?? close)) * 1000, 1);
  const up = close >= Number(c.open ?? close);
  return { time, value, color: up ? 'rgba(14, 203, 129, 0.55)' : 'rgba(246, 70, 93, 0.55)' };
}

function prepareBars(candles) {
  if (!candles?.length) return { bars: [], volumes: [] };
  const byTime = new Map();
  for (const c of candles) {
    const bar = toBar(c);
    if (bar) byTime.set(bar.time, { bar, raw: c });
  }
  const sorted = [...byTime.values()].sort((a, b) => a.bar.time - b.bar.time);
  // Times must be strictly ascending for lightweight-charts
  const bars = [];
  const volumes = [];
  let prevClose = null;
  let prevTime = null;
  for (const { bar, raw } of sorted) {
    if (prevTime != null && bar.time <= prevTime) continue;
    bars.push(bar);
    volumes.push(toVolumeBar(raw, prevClose));
    prevClose = bar.close;
    prevTime = bar.time;
  }
  return { bars, volumes: volumes.filter(Boolean) };
}

const THEMES = {
  dark: {
    bg: '#0a0e13',
    text: '#848e9c',
    grid: '#1e2329',
    border: '#2b3139',
    up: '#0ecb81',
    down: '#f6465d',
  },
  exchange: {
    bg: '#161a1e',
    text: '#848e9c',
    grid: '#2b2f36',
    border: '#2b3139',
    up: '#0ecb81',
    down: '#f6465d',
  },
  light: {
    bg: '#ffffff',
    text: '#474d57',
    grid: '#eaecef',
    border: '#eaecef',
    up: '#0ecb81',
    down: '#f6465d',
  },
};

/**
 * @param {{ candles: any[], variant?: 'dark' | 'exchange' | 'light', className?: string }} props
 */
export default function LiveChart({ candles, variant = 'exchange', className = '' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volumeRef = useRef(null);
  const lastBarTimeRef = useRef(null);
  const barCountRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const theme = THEMES[variant] || THEMES.exchange;
    const chart = createChart(el, {
      layout: {
        background: { type: 'solid', color: theme.bg },
        textColor: theme.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: theme.grid, style: 1 },
        horzLines: { color: theme.grid, style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#758696', width: 1, style: 2, labelBackgroundColor: '#2b3139' },
        horzLine: { color: '#758696', width: 1, style: 2, labelBackgroundColor: '#2b3139' },
      },
      rightPriceScale: {
        borderColor: theme.border,
        scaleMargins: { top: 0.08, bottom: 0.22 },
        autoScale: true,
      },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 7,
        minBarSpacing: 3,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    lastBarTimeRef.current = null;
    barCountRef.current = 0;

    const resize = () => {
      if (!containerRef.current || !chartRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth < 1 || clientHeight < 1) return;
      chartRef.current.applyOptions({ width: clientWidth, height: clientHeight });
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [variant]);

  useEffect(() => {
    const series = candleRef.current;
    const volumeSeries = volumeRef.current;
    const chart = chartRef.current;
    if (!series || !volumeSeries) return;

    const { bars, volumes } = prepareBars(candles);
    if (!bars.length) {
      series.setData([]);
      volumeSeries.setData([]);
      barCountRef.current = 0;
      lastBarTimeRef.current = null;
      return;
    }

    const last = bars[bars.length - 1];
    const lastVol = volumes[volumes.length - 1];
    const lastRaw = candles[candles.length - 1];
    const chartReset = Boolean(lastRaw?._chartReset);
    // Prefer incremental update(last) — full setData only on reset / first paint / big gaps
    const forceFull = chartReset || Boolean(lastRaw?._forceChart);
    const pulseZoom = Boolean(lastRaw?._pulseZoom);

    try {
      const prevCount = barCountRef.current;
      const prevTime = lastBarTimeRef.current;

      if (forceFull || prevCount === 0 || Math.abs(bars.length - prevCount) > 2) {
        series.setData(bars);
        volumeSeries.setData(volumes);
        if (chartReset) {
          try {
            series.priceScale().applyOptions({ autoScale: true });
            chart?.priceScale('right')?.applyOptions({ autoScale: true });
            series.priceScale().setAutoScale?.(true);
          } catch {
            /* older lightweight-charts */
          }
          chart?.timeScale().fitContent();
          chart?.timeScale().scrollToRealTime();
        } else if (pulseZoom) {
          const from = Math.max(0, bars.length - 80);
          chart?.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: bars.length + 4 });
        } else if (prevCount === 0) {
          chart?.timeScale().fitContent();
        }
      } else if (last.time === prevTime) {
        series.update(last);
        if (lastVol) volumeSeries.update(lastVol);
      } else if (last.time > (prevTime || 0)) {
        series.update(last);
        if (lastVol) volumeSeries.update(lastVol);
        chart?.timeScale().scrollToRealTime();
      } else {
        series.setData(bars);
        volumeSeries.setData(volumes);
        chart?.timeScale().scrollToRealTime();
      }

      barCountRef.current = bars.length;
      lastBarTimeRef.current = last.time;
    } catch (err) {
      console.warn('LiveChart update:', err.message);
      try {
        series.setData(bars);
        volumeSeries.setData(volumes);
        chart?.timeScale().scrollToRealTime();
        barCountRef.current = bars.length;
        lastBarTimeRef.current = last.time;
      } catch {
        /* chart may be disposed */
      }
    }
  }, [candles]);

  return <div className={`chart-wrap ${className}`.trim()} ref={containerRef} />;
}
