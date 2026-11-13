/**
 * XAUUSD Decision Desk — REST API.
 * All market data flows through the MCP client (server/mcp.ts).
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool, mcpHealth } from './mcp.js';
import { computeAnalysis } from './analysis/signal.js';
import { fetchCalendar } from './news/enrich.js';
import { TIMEFRAMES } from '../shared/types.js';
import type { Analysis, Candle, NewsEvent, Quote, TF } from '../shared/types.js';

const PORT = Number(process.env.PORT ?? 3001);
const SYMBOL = process.env.XAUUSD_SYMBOL ?? 'OANDA:XAUUSD';
const TF_INTERVAL: Record<TF, string> = { M5: '5m', M15: '15m', H1: '1h', H4: '4h', D1: '1D' };
const BARS_FOR_ANALYSIS = 300;

interface RawBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface RawQuote {
  lp?: number;
  ch?: number;
  chp?: number;
  bid?: number;
  ask?: number;
  high_price?: number;
  low_price?: number;
}

function parseTf(value: unknown): TF {
  return TIMEFRAMES.includes(value as TF) ? (value as TF) : 'H1';
}

async function fetchCandles(tf: TF, count: number): Promise<Candle[]> {
  const { data } = await callTool<{ symbol: string; bars: RawBar[] }>('get_ohlcv', {
    symbol: SYMBOL,
    interval: TF_INTERVAL[tf],
    count,
  });
  return (data.bars ?? []).map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume ?? 0,
  }));
}

async function fetchQuote(): Promise<Quote | null> {
  try {
    const { data } = await callTool<RawQuote & { symbol: string }>('get_quote', { symbol: SYMBOL });
    return {
      symbol: SYMBOL,
      last: data.lp ?? 0,
      change: data.ch ?? 0,
      changePct: data.chp ?? 0,
      bid: data.bid ?? null,
      ask: data.ask ?? null,
      dayHigh: data.high_price ?? null,
      dayLow: data.low_price ?? null,
      updated: Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

/** TradingView rating shape varies; extract an [-2..2] aggregate per timeframe. */
function extractRating(raw: unknown): Record<TF, number | null> {
  const out: Record<TF, number | null> = { M5: null, M15: null, H1: null, H4: null, D1: null };
  const keyFor: Record<TF, string> = { M5: '5', M15: '15', H1: '60', H4: '240', D1: '1D' };
  if (!raw || typeof raw !== 'object') return out;
  const table = raw as Record<string, unknown>;
  for (const tf of TIMEFRAMES) {
    const entry = table[keyFor[tf]] ?? table[tf];
    if (!entry || typeof entry !== 'object') continue;
    const all = (entry as Record<string, unknown>).All;
    if (typeof all === 'number') out[tf] = all;
    else if (all && typeof all === 'object') {
      const score = (all as Record<string, unknown>).rating ?? (all as Record<string, unknown>).score;
      if (typeof score === 'number') out[tf] = score;
    }
  }
  return out;
}

async function fetchRatings(): Promise<Record<TF, number | null>> {
  try {
    const { data } = await callTool<unknown>('get_technical_analysis', { symbol: SYMBOL });
    return extractRating(data);
  } catch {
    return { M5: null, M15: null, H1: null, H4: null, D1: null };
  }
}

interface AnalysisCache {
  value: Analysis;
  generatedAtMs: number;
}
let analysisCache: AnalysisCache | null = null;
let analysisInFlight: Promise<Analysis> | null = null;

/** A cached analysis is never served older than MAX; the stream ticker may
 *  recompute sooner (down to MIN) when the price has moved materially. */
const ANALYSIS_MIN_AGE_MS = 8_000;
const ANALYSIS_MAX_AGE_MS = 20_000;

async function computeAnalysisFull(): Promise<Analysis> {
  const [candleSets, quote, ratings, events] = await Promise.all([
    Promise.all(TIMEFRAMES.map((tf) => fetchCandles(tf, BARS_FOR_ANALYSIS))),
    fetchQuote(),
    fetchRatings(),
    fetchCalendar({ hoursBehind: 2, hoursAhead: 24 * 8 }),
  ]);

  const candles = Object.fromEntries(TIMEFRAMES.map((tf, i) => [tf, candleSets[i]])) as Record<TF, Candle[]>;
  const value = computeAnalysis({ symbol: SYMBOL, quote, candles, tvRatings: ratings, events });
  analysisCache = { value, generatedAtMs: Date.now() };
  return value;
}

/** Single-flight: REST handler and stream ticker share one compute. */
function recomputeAnalysis(): Promise<Analysis> {
  if (!analysisInFlight) {
    analysisInFlight = computeAnalysisFull().finally(() => {
      analysisInFlight = null;
    });
  }
  return analysisInFlight;
}

async function getAnalysis(): Promise<Analysis> {
  if (analysisCache && Date.now() - analysisCache.generatedAtMs < ANALYSIS_MAX_AGE_MS) return analysisCache.value;
  return recomputeAnalysis();
}

const app = express();

app.get('/api/health', async (_req, res) => {
  const mcp = await mcpHealth();
  res.json({ ok: mcp.connected, symbol: SYMBOL, mcp, ts: Date.now() });
});

app.get('/api/quote', async (_req, res) => {
  res.json(await fetchQuote());
});

app.get('/api/candles', async (req, res) => {
  const tf = parseTf(req.query.tf);
  const count = Math.min(Math.max(Number(req.query.count ?? 300) || 300, 50), 5000);
  res.json({ tf, bars: await fetchCandles(tf, count) });
});

app.get('/api/analysis', async (_req, res, next) => {
  try {
    res.json(await getAnalysis());
  } catch (err) {
    next(err);
  }
});

app.get('/api/news', async (req, res, next) => {
  try {
    const hours = Math.min(Math.max(Number(req.query.hours ?? 168) || 168, 1), 24 * 31);
    const impact = String(req.query.impact ?? 'all').toLowerCase();
    const events: NewsEvent[] = await fetchCalendar({ hoursBehind: 6, hoursAhead: hours });
    const filtered = impact === 'all' ? events : events.filter((ev) => ev.impact.toLowerCase() === impact);
    res.json({ count: filtered.length, events: filtered });
  } catch (err) {
    next(err);
  }
});

// ---- Realtime push (SSE): quote on every price tick, analysis on change ----
const QUOTE_TICK_MS = 3_000;
const HEARTBEAT_EVERY_TICKS = 5; // ": hb" keep-alive comment every 15s

const streamClients = new Set<express.Response>();
let streamTimer: NodeJS.Timeout | undefined = undefined;
let streamTicks = 0;
let lastQuotePushed: Quote | null = null;

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streamClients) res.write(payload);
}

/** Recompute the plan once price moved ~0.2×ATR(H1) since it was generated. */
function analysisPriceMoved(analysis: Analysis, price: number): boolean {
  const atrH1 = analysis.mtf.find((m) => m.tf === 'H1')?.atr ?? 0;
  const threshold = Math.max(0.2 * atrH1, 0.25);
  const ref = analysis.quote?.last ?? null;
  return ref !== null && Math.abs(price - ref) >= threshold;
}

async function streamTick(): Promise<void> {
  const quote = await fetchQuote();
  if (
    quote &&
    (quote.last !== lastQuotePushed?.last || quote.bid !== lastQuotePushed?.bid || quote.ask !== lastQuotePushed?.ask)
  ) {
    lastQuotePushed = quote;
    broadcast('quote', quote);
  }

  const cached = analysisCache;
  const ageMs = cached ? Date.now() - cached.generatedAtMs : Number.POSITIVE_INFINITY;
  const moved = cached !== null && quote !== null && analysisPriceMoved(cached.value, quote.last);
  if (!cached || ageMs >= ANALYSIS_MAX_AGE_MS || (moved && ageMs >= ANALYSIS_MIN_AGE_MS)) {
    broadcast('analysis', await recomputeAnalysis());
  }
}

function startStream(): void {
  if (streamTimer) return;
  streamTimer = setInterval(() => {
    streamTicks += 1;
    if (streamTicks % HEARTBEAT_EVERY_TICKS === 0) {
      for (const res of streamClients) res.write(': hb\n\n');
    }
    streamTick().catch((err) => {
      console.error('[api] stream tick:', err instanceof Error ? err.message : err);
    });
  }, QUOTE_TICK_MS);
}

function stopStream(): void {
  clearInterval(streamTimer);
  streamTimer = undefined;
}

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  streamClients.add(res);
  startStream();

  // Initial snapshot so clients render immediately (also delivered on SSE reconnect).
  void (async () => {
    try {
      const [quote, analysis] = await Promise.all([fetchQuote(), getAnalysis()]);
      if (quote) {
        lastQuotePushed = quote;
        res.write(`event: quote\ndata: ${JSON.stringify(quote)}\n\n`);
      }
      res.write(`event: analysis\ndata: ${JSON.stringify(analysis)}\n\n`);
    } catch (err) {
      console.error('[api] stream snapshot:', err instanceof Error ? err.message : err);
    }
  })();

  req.on('close', () => {
    streamClients.delete(res);
    if (streamClients.size === 0) stopStream();
  });
});

// Serve the built client in production.
const clientDist = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'client/dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[api]', message);
  res.status(500).json({ error: message });
});

app.listen(PORT, '127.0.0.1', () => {
  console.error(`[api] XAUUSD Decision Desk listening on http://127.0.0.1:${PORT} (symbol ${SYMBOL})`);
});
