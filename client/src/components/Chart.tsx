import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type LogicalRangeChangeEventHandler,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  TickMarkType,
  type UTCTimestamp,
} from 'lightweight-charts';
import { ema, macd, rsi } from '../../../shared/indicators';
import type { Candle, Pattern, TF, TradePlan } from '../../../shared/types';
import { fmtDateWib, fmtNum, fmtTimeWib } from '../lib/format';
import Button from '../ui/Button';
import { NUM } from '../ui/styles';

interface ChartProps {
  candles: Candle[];
  /** Selected timeframe (drives the tick formatter). */
  tf: TF;
  /** Timeframe the current `candles` belong to — differs from `tf` while a
   *  switch is still loading; only a change here may reset the viewport. */
  dataTf: TF | null;
  plan: TradePlan;
  patterns: Pattern[];
  /** Live tick from the quote stream; patches the developing bar between candle polls. */
  livePrice: number | null;
  /** True while the RSI/MACD pane is open; the host widens the chart area. */
  full?: boolean;
}

type Pane = 'none' | 'rsi' | 'macd';

/**
 * Canvas chart cannot read CSS variables cheaply, so the chart palette is
 * mirrored here. Keep in sync with the --color-chart-* tokens in index.css.
 */
const CHART = {
  up: '#16a34a',
  down: '#dc2626',
  grid: '#eef2f7',
  axis: '#94a3b8',
  border: '#e2e8f0',
  crosshair: '#94a3b8',
  ema20: '#2563eb',
  ema50: '#d97706',
  ema200: '#7c3aed',
  rsi: '#0284c7',
  macd: '#2563eb',
  signal: '#d97706',
} as const;

/** Bars visible on open / TF switch; older history is one pan away. */
const INITIAL_BARS = 180;

const EMA_OVERLAYS = [
  { period: 20, color: CHART.ema20 },
  { period: 50, color: CHART.ema50 },
  { period: 200, color: CHART.ema200 },
] as const;

const MARKER_SHAPE: Record<Pattern['direction'], 'arrowUp' | 'arrowDown' | 'circle'> = {
  bull: 'arrowUp',
  bear: 'arrowDown',
  neutral: 'circle',
};

const MARKER_COLOR: Record<Pattern['direction'], string> = {
  bull: CHART.up,
  bear: CHART.down,
  neutral: CHART.axis,
};

/** Day-boundary ticks show a date; intraday ticks show WIB time. */
function tickFormatter(tf: TF) {
  return (time: UTCTimestamp, tickMarkType: TickMarkType) =>
    tf === 'D1' || tickMarkType < TickMarkType.Time ? fmtDateWib(time as number) : fmtTimeWib(time as number);
}

/** Shared chart options so price and indicator panes line up pixel for pixel. */
const baseOptions = (tf: TF) => ({
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: CHART.axis,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    attributionLogo: false,
  },
  grid: { vertLines: { color: CHART.grid }, horzLines: { color: CHART.grid } },
  timeScale: {
    timeVisible: true,
    secondsVisible: false,
    borderColor: CHART.border,
    rightOffset: 4,
    barSpacing: 7,
    tickMarkFormatter: tickFormatter(tf),
  },
  crosshair: {
    vertLine: { color: CHART.crosshair, labelBackgroundColor: '#334155' },
    horzLine: { color: CHART.crosshair, labelBackgroundColor: '#334155' },
  },
});

interface Legend {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema: (number | null)[];
  rsi: number | null;
  macdHist: number | null;
}

export default function Chart({ candles, tf, dataTf, plan, patterns, livePrice, full = false }: ChartProps) {
  const chartElRef = useRef<HTMLDivElement>(null);

  const priceRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const emaRef = useRef<ISeriesApi<'Line'>[]>([]);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markerRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // RSI/MACD live in the same chart as the candles, each on its own price
  // scale (the same trick volume uses) so they share the time axis by
  // construction — no cross-chart syncing that can drift.
  const rsiRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSigRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  /** Dataset the viewport was last fitted to; a poll must never refit. */
  const fittedTfRef = useRef<TF | null>(null);

  const [showEma, setShowEma] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [pane, setPane] = useState<Pane>('none');
  const [legend, setLegend] = useState<Legend | null>(null);
  const [atLatest, setAtLatest] = useState(true);

  // Create the chart once.
  useEffect(() => {
    const el = chartElRef.current;
    if (!el) return;

    const price = createChart(el, {
      ...baseOptions(tf),
      autoSize: true,
      rightPriceScale: { borderColor: CHART.border, scaleMargins: { top: 0.08, bottom: 0.26 } },
    });

    const candleSeries = price.addSeries(CandlestickSeries, {
      upColor: CHART.up,
      downColor: CHART.down,
      wickUpColor: CHART.up,
      wickDownColor: CHART.down,
      borderVisible: false,
    });


    const volumeSeries = price.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const emas = EMA_OVERLAYS.map((o) =>
      price.addSeries(LineSeries, {
        color: o.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    );

    const markers = createSeriesMarkers(candleSeries, []);

    const rsiSeries = price.addSeries(LineSeries, {
      color: CHART.rsi,
      lineWidth: 1,
      priceScaleId: 'rsi',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const macdLine = price.addSeries(LineSeries, {
      color: CHART.macd,
      lineWidth: 1,
      priceScaleId: 'macd',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const macdSignal = price.addSeries(LineSeries, {
      color: CHART.signal,
      lineWidth: 1,
      priceScaleId: 'macd',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const macdHist = price.addSeries(HistogramSeries, { priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false, visible: false });

    // Overlay scales: hidden axes, bands assigned later by the stack effect.
    for (const id of ['volume', 'rsi', 'macd']) price.priceScale(id).applyOptions({ visible: false });

    price.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      const data = candleSeries.data();
      setAtLatest(!r || data.length === 0 || r.to >= data.length - 1.5);
    });

    priceRef.current = price;
    candleRef.current = candleSeries;
    emaRef.current = emas;
    volRef.current = volumeSeries;
    markerRef.current = markers;
    rsiRef.current = rsiSeries;
    macdLineRef.current = macdLine;
    macdSigRef.current = macdSignal;
    macdHistRef.current = macdHist;

    return () => {
      price.remove();
      priceRef.current = null;
      candleRef.current = null;
      emaRef.current = [];
      volRef.current = null;
      markerRef.current = null;
      rsiRef.current = null;
      macdLineRef.current = null;
      macdSigRef.current = null;
      macdHistRef.current = null;
      priceLinesRef.current = [];
      fittedTfRef.current = null;
    };
  }, []);

  // Push candle data + overlays. Polls replace the dataset every 20s, so the
  // visible time range is restored afterwards — only a timeframe switch (or the
  // first load) resets the viewport to the latest price. Time (not logical
  // index) is used so the view survives the oldest bar dropping out of the window.
  useEffect(() => {
    const price = priceRef.current;
    const series = candleRef.current;
    if (!price || !series || candles.length === 0) return;

    const refit = fittedTfRef.current !== dataTf;
    const range = refit ? null : price.timeScale().getVisibleLogicalRange();

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
    const emaValues = EMA_OVERLAYS.map((o) => ema(closes, o.period));
    emaValues.forEach((values, i) => {
      emaRef.current[i]?.setData(
        values.flatMap((value, idx) => (value === null ? [] : [{ time: candles[idx].time as UTCTimestamp, value }])),
      );
    });

    volRef.current?.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)',
      })),
    );

    const rsiValues = rsi(closes);
    const m = macd(closes);
    rsiRef.current?.setData(
      rsiValues.flatMap((v, i) => (v === null ? [] : [{ time: candles[i].time as UTCTimestamp, value: v }])),
    );
    macdLineRef.current?.setData(m.line.flatMap((v, i) => (v === null ? [] : [{ time: candles[i].time as UTCTimestamp, value: v }])));
    macdSigRef.current?.setData(m.signal.flatMap((v, i) => (v === null ? [] : [{ time: candles[i].time as UTCTimestamp, value: v }])));
    macdHistRef.current?.setData(
      m.hist.flatMap((v, i) =>
        v === null ? [] : [{ time: candles[i].time as UTCTimestamp, value: v, color: v >= 0 ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)' }],
      ),
    );

    const lastIdx = candles.length - 1;
    setLegend({
      time: candles[lastIdx].time,
      open: candles[lastIdx].open,
      high: candles[lastIdx].high,
      low: candles[lastIdx].low,
      close: candles[lastIdx].close,
      volume: candles[lastIdx].volume,
      ema: emaValues.map((s) => s[lastIdx]),
      rsi: rsiValues[lastIdx],
      macdHist: m.hist[lastIdx],
    });

    price.applyOptions({ timeScale: { tickMarkFormatter: tickFormatter(tf) } });

    // First load / TF switch: open on a readable window at the right edge.
    // The full dataset stays loaded so panning left reveals older history;
    // `fitContent()` would squash thousands of bars into illegible candles.
    if (range) price.timeScale().setVisibleLogicalRange(range);
    else {
      const from = Math.max(0, candles.length - INITIAL_BARS);
      price.timeScale().setVisibleLogicalRange({ from, to: candles.length - 1 + 4 });
    }
    fittedTfRef.current = dataTf;
  }, [candles, tf, dataTf]);

  // Patch the developing bar with the live tick between candle polls.
  // Incremental update only — no setData/fitContent churn per tick.
  useEffect(() => {
    const series = candleRef.current;
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

  // Overlay/indicator toggles.
  useEffect(() => {
    for (const s of emaRef.current) s.applyOptions({ visible: showEma });
    volRef.current?.applyOptions({ visible: showVolume });
  }, [showEma, showVolume]);

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
    markerRef.current?.setMarkers(markers);
  }, [patterns, tf]);

  // Trade plan price lines.
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];

    const lines: { price: number | null; color: string; title: string; style: LineStyle }[] = [
      { price: plan.entry, color: '#334155', title: 'ENTRY', style: LineStyle.Solid },
      { price: plan.sl, color: CHART.down, title: 'SL', style: LineStyle.Dashed },
      { price: plan.tp1, color: CHART.up, title: 'TP1', style: LineStyle.Dashed },
      { price: plan.tp2, color: CHART.up, title: 'TP2', style: LineStyle.Dotted },
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

  // Indicators share the candle chart's time axis; only their price bands are
  // stacked bottom-up, volume first. Each band is 18% of the plot height.
  useEffect(() => {
    const chart = priceRef.current;
    // Overlay scales only exist once their series do; this effect can run
    // before the init effect has created them.
    if (!chart || !volRef.current || !rsiRef.current || !macdHistRef.current) return;
    const BAND = 0.18;
    const bands = [showVolume, pane === 'rsi', pane === 'macd'].filter(Boolean).length;
    const bottom = bands * BAND;

    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.04 + bottom } });


    let offset = 0;
    const place = (id: 'volume' | 'rsi' | 'macd', shown: boolean) => {
      chart.priceScale(id).applyOptions({
        visible: false,
        scaleMargins: shown ? { top: 1 - offset - BAND, bottom: offset } : { top: 1, bottom: 0 },
      });
      if (shown) offset += BAND;
    };
    place('volume', showVolume);
    place('rsi', pane === 'rsi');
    place('macd', pane === 'macd');
  }, [showVolume, pane]);

  // Toggle the indicator series themselves.
  useEffect(() => {
    rsiRef.current?.applyOptions({ visible: pane === 'rsi' });
    macdLineRef.current?.applyOptions({ visible: pane === 'macd' });
    macdSigRef.current?.applyOptions({ visible: pane === 'macd' });
    macdHistRef.current?.applyOptions({ visible: pane === 'macd' });
  }, [pane]);

  // Crosshair drives the OHLC legend; leaving the chart restores the latest bar.
  useEffect(() => {
    const chart = priceRef.current;
    if (!chart || candles.length === 0) return;
    const closes = candles.map((c) => c.close);
    const emaValues = EMA_OVERLAYS.map((o) => ema(closes, o.period));
    const rsiValues = rsi(closes);
    const macdValues = macd(closes).hist;
    const byTime = new Map(candles.map((c, i) => [c.time, i]));
    const lastIdx = candles.length - 1;

    const write = (idx: number) => {
      const c = candles[idx];
      setLegend({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        ema: emaValues.map((s) => s[idx]),
        rsi: rsiValues[idx],
        macdHist: macdValues[idx],
      });
    };

    const handler = (param: { time?: unknown }) => {
      const idx = typeof param.time === 'number' ? byTime.get(param.time) : undefined;
      write(idx ?? lastIdx);
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [candles]);

  const up = legend ? legend.close >= legend.open : true;

  return (
    <div className={`flex w-full flex-col bg-surface ${full ? 'h-full' : ''}`}>
      <div className="relative min-h-[320px] flex-1">
        <div ref={chartElRef} className="absolute inset-0" />

        {/* Legend: OHLC of the hovered (or latest) bar. */}
        {legend && (
          <div className="pointer-events-none absolute left-3 top-2 z-10 max-w-[calc(100%-7.5rem)] text-2xs text-muted">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className={`${NUM} font-medium ${up ? 'text-bull' : 'text-bear'}`}>
                {tf} · {fmtTimeWib(legend.time)}
              </span>
              {(
                [
                  ['O', legend.open],
                  ['H', legend.high],
                  ['L', legend.low],
                  ['C', legend.close],
                ] as const
              ).map(([k, v]) => (
                <span key={k}>
                  {k} <span className={`${NUM} text-fg/80`}>{v.toFixed(2)}</span>
                </span>
              ))}
            </div>
            {/* Secondary readings stay hidden on narrow charts so they never cover candles. */}
            <div className="mt-0.5 hidden flex-wrap items-center gap-x-3 gap-y-0.5 md:flex">
              {EMA_OVERLAYS.map((o, i) => (
                <span key={o.period} className={`flex items-center gap-1 ${showEma ? '' : 'opacity-40'}`}>
                  <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: o.color }} />
                  EMA{o.period} <span className={`${NUM} text-fg/80`}>{fmtNum(legend.ema[i])}</span>
                </span>
              ))}
              {pane === 'rsi' && (
                <span>
                  <span className="mr-1 inline-block h-0.5 w-3 rounded-full align-middle" style={{ backgroundColor: CHART.rsi }} />
                  RSI14{' '}
                  <span className={`${NUM} ${(legend.rsi ?? 50) > 70 ? 'text-bear' : (legend.rsi ?? 50) < 30 ? 'text-bull' : 'text-fg/80'}`}>
                    {fmtNum(legend.rsi)}
                  </span>
                </span>
              )}
              {pane === 'macd' && (
                <span>
                  MACD <span className={`${NUM} text-fg/80`}>{fmtNum(legend.macdHist, 2)}</span>
                </span>
              )}
              {showVolume && (
                <span>
                  VOL <span className={`${NUM} text-fg/80`}>{legend.volume.toLocaleString('id-ID')}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {!atLatest && (
          <button
            onClick={() => priceRef.current?.timeScale().scrollToRealTime()}
            className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-fg shadow-sm hover:bg-surface-2"
          >
            Kembali ke harga terkini
          </button>
        )}
      </div>

      {/* Indicator controls: a real bar, not an overlay, so it never covers candles on narrow screens. */}
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-t border-line bg-surface px-2 py-1">
        <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-faint">Indikator</span>
        <Button size="sm" pressed={showEma} onClick={() => setShowEma(!showEma)} label="EMA 20/50/200">
          EMA
        </Button>
        <Button size="sm" pressed={showVolume} onClick={() => setShowVolume(!showVolume)} label="Volume">
          Vol
        </Button>
        <Button size="sm" pressed={pane === 'rsi'} onClick={() => setPane(pane === 'rsi' ? 'none' : 'rsi')} label="Pane RSI 14">
          RSI
        </Button>
        <Button size="sm" pressed={pane === 'macd'} onClick={() => setPane(pane === 'macd' ? 'none' : 'macd')} label="Pane MACD 12/26/9">
          MACD
        </Button>
      </div>

    </div>
  );
}
