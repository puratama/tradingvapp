import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analysis, Candle, NewsEvent, Quote, TF } from '../../../shared/types';

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

function usePoll<T>(url: string, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    void load();
    timer.current = setInterval(() => void load(), intervalMs);
    return () => clearInterval(timer.current);
  }, [load, intervalMs]);

  return { data, error, loading, refresh: () => void load() };
}

// ---- Realtime stream: one shared SSE connection feeding quote + analysis ----
type StreamEvent = 'quote' | 'analysis' | 'error';

let es: EventSource | null = null;
const streamListeners = new Set<(event: StreamEvent, payload: unknown) => void>();

function emitStream(event: StreamEvent, payload: unknown): void {
  for (const fn of streamListeners) fn(event, payload);
}

function ensureStream(): void {
  if (es) return;
  es = new EventSource('/api/stream');
  for (const event of ['quote', 'analysis'] as const) {
    es.addEventListener(event, (ev) => emitStream(event, JSON.parse((ev as MessageEvent<string>).data)));
  }
  // EventSource reconnects on its own; the server re-sends a snapshot per connection.
  es.onerror = () => emitStream('error', null);
}

function useStream<T>(event: 'quote' | 'analysis', refreshUrl: string): PollState<T> {
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
  }, [event, load]);

  return { data, error, loading, refresh: () => void load() };
}

export function useAnalysis() {
  return useStream<Analysis>('analysis', '/api/analysis');
}

export function useQuote() {
  return useStream<Quote>('quote', '/api/quote');
}

export function useCandles(tf: TF) {
  return usePoll<{ tf: TF; bars: Candle[] }>(`/api/candles?tf=${tf}&count=300`, 20_000);
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
