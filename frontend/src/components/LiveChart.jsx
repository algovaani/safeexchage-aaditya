import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

function toBar(c) {
  return {
    time: Math.floor(c.openTime / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

const THEMES = {
  dark: {
    bg: '#0a0e13',
    text: '#c8d0da',
    grid: '#1f2937',
    border: '#243041',
  },
  light: {
    bg: '#ffffff',
    text: '#334155',
    grid: '#e2e8f0',
    border: '#e2e8f0',
  },
};

/**
 * @param {{ candles: any[], tick?: any, reset?: any, variant?: 'dark' | 'light', className?: string }} props
 */
export default function LiveChart({ candles, tick, reset, variant = 'dark', className = '' }) {
  const containerRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const theme = THEMES[variant] || THEMES.dark;

    const chart = createChart(containerRef.current, {
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
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    ro.observe(containerRef.current);
    chart.applyOptions({
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    return () => {
      ro.disconnect();
      chart.remove();
      seriesRef.current = null;
    };
  }, [variant]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !candles?.length) return;
    series.setData(candles.map(toBar));
  }, [candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !tick) return;
    series.update(toBar(tick));
  }, [tick]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !reset?.length) return;
    series.setData(reset.map(toBar));
  }, [reset]);

  return <div className={`chart-wrap ${className}`.trim()} ref={containerRef} />;
}
