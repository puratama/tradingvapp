import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analysis, Candle, EntryStyle, NewsEvent, Quote, TF, TradeRecord } from '../../../shared/types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/** `intervalMs = 0` means paused: no initial fetch, no timer. */
function usePoll<T>(url: string, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(intervalMs > 0);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setData(await getJson<T>(url));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (intervalMs <= 0) return;
    setLoading(true);
    void load();
    timer.current = setInterval(() => void load(), intervalMs);
    return () => clearInterval(timer.current);
  }, [load, intervalMs]);

  return { data, error, loading, refresh: () => void load() };
}

// ---- Realtime stream: one shared SSE connection feeding quote + analysis ----
type StreamEvent = 'quote' | 'analysis' | 'trades' | 'error';

let es: EventSource | null = null;
const streamListeners = new Set<(event: StreamEvent, payload: unknown) => void>();

function emitStream(event: StreamEvent, payload: unknown): void {
  for (const fn of streamListeners) fn(event, payload);
}

function ensureStream(): void {
  if (es) return;
  es = new EventSource('/api/stream');
  for (const event of ['quote', 'analysis', 'trades'] as const) {
    es.addEventListener(event, (ev) => emitStream(event, JSON.parse((ev as MessageEvent<string>).data)));
  }
  // EventSource reconnects on its own; the server re-sends a snapshot per connection.
  es.onerror = () => emitStream('error', null);
}

function useStream<T>(event: 'quote' | 'analysis' | 'trades', refreshUrl: string, enabled = true): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasData = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await getJson<T>(refreshUrl));
      hasData.current = true;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshUrl]);

  useEffect(() => {
    if (!enabled) return;
    ensureStream();
    const onEvent = (name: StreamEvent, payload: unknown) => {
      if (name === event) {
        hasData.current = true;
        setData(payload as T);
        setError(null);
        setLoading(false);
      } else if (name === 'error' && !hasData.current) {
        setError('Koneksi realtime terputus — mencoba menyambung ulang…');
      }
    };
    streamListeners.add(onEvent);
    void load(); // snapshot fallback if SSE is unavailable
    return () => {
      streamListeners.delete(onEvent);
    };
  }, [event, load, enabled]);

  return { data, error, loading, refresh: () => void load() };
}

/** Entry style: swing plans live hours, scalp plans minutes (M5 basis stops).
 *  The SSE snapshot is always swing, so scalp mode polls its own REST route and
 *  leaves the swing stream unsubscribed — only one analysis source runs. */
export function useAnalysis(style: EntryStyle = 'swing') {
  const swing = useStream<Analysis>('analysis', '/api/analysis', style === 'swing');
  const scalp = usePoll<Analysis>('/api/analysis?style=scalp', style === 'scalp' ? 15_000 : 0);
  return style === 'scalp' ? scalp : swing;
}

export function useQuote() {
  return useStream<Quote>('quote', '/api/quote');
}

export function useTrades() {
  return useStream<TradeRecord[]>('trades', '/api/trades');
}

/**
 * Latest candles for a timeframe. 5000 is the bridge maximum (~10 months of
 * H1, ~1 year of H4) so the user can pan left into real history instead of
 * hitting the edge of a short window. Polling keeps the right edge live; M1/M5
 * close in seconds, so they refetch far sooner than H4/D1.
 */
export function useCandles(tf: TF) {
  const intervalMs = tf === 'M1' ? 3_000 : tf === 'M5' ? 5_000 : tf === 'M15' ? 10_000 : 20_000;
  return usePoll<{ tf: TF; bars: Candle[] }>(`/api/candles?tf=${tf}&count=5000`, intervalMs);
}

export function useNews() {
  return usePoll<{ count: number; events: NewsEvent[] }>('/api/news?hours=168', 300_000);
}

export function useHealth() {
  return usePoll<{ ok: boolean; symbol: string; mcp: { connected: boolean; tools: string[] } }>('/api/health', 60_000);
}

/** WIB wall clock, ticking every second. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
