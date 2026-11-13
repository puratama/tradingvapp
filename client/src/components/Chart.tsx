import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  TickMarkType,
  type UTCTimestamp,
} from 'lightweight-charts';
import { ema } from '../../../shared/indicators';
import type { Candle, Pattern, TF, TradePlan } from '../../../shared/types';
import { fmtDateWib, fmtTimeWib } from '../lib/format';

interface ChartProps {
  candles: Candle[];
  tf: TF;
  plan: TradePlan;
  patterns: Pattern[];
  /** Live tick from the quote stream; patches the developing bar between candle polls. */
  livePrice: number | null;
  /** Fill available height instead of the fixed default. */
  full?: boolean;
}

const EMA_OVERLAYS = [
  { period: 20, color: '#d8a93a', width: 1 },
  { period: 50, color: '#5b8dd6', width: 1 },
  { period: 200, color: '#9d7bc9', width: 1 },
] as const;

const MARKER_SHAPE: Record<Pattern['direction'], 'arrowUp' | 'arrowDown' | 'circle'> = {
  bull: 'arrowUp',
  bear: 'arrowDown',
  neutral: 'circle',
};

const MARKER_COLOR: Record<Pattern['direction'], string> = {
  bull: '#35c77d',
  bear: '#f0554a',
  neutral: '#808fa4',
};

/** Day-boundary ticks show a date; intraday ticks show WIB time. */
function tickFormatter(tf: TF) {
  return (time: UTCTimestamp, tickMarkType: TickMarkType) =>
    tf === 'D1' || tickMarkType < TickMarkType.Time ? fmtDateWib(time as number) : fmtTimeWib(time as number);
}

export default function Chart({ candles, tf, plan, patterns, livePrice, full = false }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Create chart + series once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#808fa4',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(126,141,160,0.07)' },
        horzLines: { color: 'rgba(126,141,160,0.07)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#242e3b',
        tickMarkFormatter: tickFormatter(tf),
      },
      rightPriceScale: { borderColor: '#242e3b' },
      localization: { timeFormatter: (time: UTCTimestamp) => fmtTimeWib(time as number) },
      crosshair: {
        vertLine: { color: 'rgba(216,169,58,0.35)', labelBackgroundColor: '#d8a93a' },
        horzLine: { color: 'rgba(216,169,58,0.35)', labelBackgroundColor: '#d8a93a' },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#35c77d',
      downColor: '#f0554a',
      wickUpColor: '#35c77d',
      wickDownColor: '#f0554a',
      borderVisible: false,
    });

    emaSeriesRef.current = EMA_OVERLAYS.map((o) =>
      chart.addSeries(LineSeries, {
        color: o.color,
        lineWidth: o.width,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    );

    markersRef.current = createSeriesMarkers(candleSeries, []);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      emaSeriesRef.current = [];
      markersRef.current = null;
    };
  }, []);

  // Push candle data + EMA overlays.
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || candles.length === 0) return;

    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const closes = candles.map((c) => c.close);
    EMA_OVERLAYS.forEach((o, i) => {
      const data = ema(closes, o.period).flatMap((value: number | null, idx: number) =>
        value === null ? [] : [{ time: candles[idx].time as UTCTimestamp, value }],
      );
      emaSeriesRef.current[i]?.setData(data);
    });

    chart.applyOptions({
      timeScale: {
        tickMarkFormatter: tickFormatter(tf),
      },
    });
    chart.timeScale().fitContent();
  }, [candles, tf]);

  // Patch the developing bar with the live tick between candle polls.
  // Incremental update only — no setData/fitContent churn per tick.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || candles.length === 0 || !livePrice) return;
    const last = candles[candles.length - 1];
    series.update({
      time: last.time as UTCTimestamp,
      open: last.open,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
      close: livePrice,
    });
  }, [livePrice, candles]);

  // Pattern markers (only patterns belonging to the visible timeframe).
  useEffect(() => {
    const markers: SeriesMarker<UTCTimestamp>[] = patterns
      .filter((p) => p.tf === tf)
      .map((p) => ({
        time: p.time as UTCTimestamp,
        position: p.direction === 'bear' ? 'aboveBar' : 'belowBar',
        color: MARKER_COLOR[p.direction],
        shape: MARKER_SHAPE[p.direction],
        text: p.name.split(' ').slice(0, 2).join(' '),
      }));
    markersRef.current?.setMarkers(markers);
  }, [patterns, tf]);

  // Trade plan price lines.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];

    const lines: { price: number | null; color: string; title: string; style: LineStyle }[] = [
      { price: plan.entry, color: '#d8a93a', title: 'ENTRY', style: LineStyle.Solid },
      { price: plan.sl, color: '#f0554a', title: 'SL', style: LineStyle.Dashed },
      { price: plan.tp1, color: '#35c77d', title: 'TP1', style: LineStyle.Dashed },
      { price: plan.tp2, color: '#35c77d', title: 'TP2', style: LineStyle.Dotted },
    ];
    for (const l of lines) {
      if (l.price === null) continue;
      priceLinesRef.current.push(
        series.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: l.style,
          axisLabelVisible: true,
          title: l.title,
        }),
      );
    }
  }, [plan]);

  return (
    <div className={`relative w-full ${full ? 'h-full min-h-[420px]' : 'h-[520px]'}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-2 flex gap-3 text-[10px] text-mute">
        {EMA_OVERLAYS.map((o) => (
          <span key={o.period} className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ backgroundColor: o.color }} />
            EMA {o.period}
          </span>
        ))}
      </div>
    </div>
  );
}
