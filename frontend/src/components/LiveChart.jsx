import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

/** @returns {import('lightweight-charts').UTCTimestamp | null} */
function toChartTime(openTime) {
  if (openTime == null) return null;
  const n = typeof openTime === 'number' ? openTime : Number(openTime);
  if (!Number.isFinite(n)) return null;
  return (n > 1e12 ? Math.floor(n / 1000) : Math.floor(n));
}

function toBar(c) {
  const time = toChartTime(c?.openTime ?? c?.time);
  if (time == null) return null;
  const open = Number(c.open);
  const high = Number(c.high);
  const low = Number(c.low);
  const close = Number(c.close);
  if (![open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

function prepareBars(candles) {
  if (!candles?.length) return [];
  const byTime = new Map();
  for (const c of candles) {
    const bar = toBar(c);
    if (bar) byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

const THEMES = {
  dark: {
    bg: '#0a0e13',
    text: '#c8d0da',
    grid: '#1f2937',
    border: '#243041',
    up: '#16a34a',
    down: '#dc2626',
  },
  exchange: {
    bg: '#0b121e',
    text: '#848e9c',
    grid: '#1e2329',
    border: '#2b3139',
    up: '#2ebd85',
    down: '#f6465d',
  },
  light: {
    bg: '#ffffff',
    text: '#334155',
    grid: '#e2e8f0',
    border: '#e2e8f0',
    up: '#16a34a',
    down: '#dc2626',
  },
};

/**
 * @param {{ candles: any[], variant?: 'dark' | 'light', className?: string }} props
 */
export default function LiveChart({ candles, variant = 'dark', className = '' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const theme = THEMES[variant] || THEMES.dark;
    const chart = createChart(el, {
      layout: {
        background: { type: 'solid', color: theme.bg },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
    });

    const series = chart.addCandlestickSeries({
      upColor: theme.up || '#16a34a',
      downColor: theme.down || '#dc2626',
      borderVisible: false,
      wickUpColor: theme.up || '#16a34a',
      wickDownColor: theme.down || '#dc2626',
    });

    chartRef.current = chart;
    seriesRef.current = series;

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
      seriesRef.current = null;
    };
  }, [variant]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const data = prepareBars(candles);
    if (!data.length) {
      series.setData([]);
      return;
    }

    try {
      series.setData(data);
    } catch (err) {
      console.warn('LiveChart setData:', err.message);
    }
  }, [candles]);

  return <div className={`chart-wrap ${className}`.trim()} ref={containerRef} />;
}
