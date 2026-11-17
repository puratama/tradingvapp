/**
 * MCP client to the local "tradingview-lite" bridge (stdio).
 * All market data in the app flows through this layer, so the bridge can be
 * swapped for the official TradingView MCP (https://mcp.tradingview.com/mcp)
 * without touching the analysis engine.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Short TTLs for market data: the stream ticker drives freshness, the cache
// only dedupes concurrent/rapid calls (REST + SSE snapshot + analysis recompute).
const TTL_MS: Record<string, number> = {
  get_ohlcv: 10_000,
  get_quote: 3_000,
  get_technical_analysis: 60_000,
  get_economic_calendar: 300_000,
  search_symbol: 86_400_000,
};

interface CacheEntry {
  value: Promise<unknown>;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
let clientPromise: Promise<Client> | null = null;

async function connect(): Promise<Client> {
  const bridgePath = fileURLToPath(new URL('../mcp-bridge/index.ts', import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', bridgePath],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'xauusd-decision-desk', version: '0.1.0' });
  await client.connect(transport);
  client.setNotificationHandler(QuotePushSchema, (n) => {
    for (const cb of quotePushListeners) cb(n.params);
  });
  console.error('[mcp] tradingview-lite bridge connected');
  return client;
}

function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export interface ToolResult<T> {
  data: T;
  fromCache: boolean;
}

export async function callTool<T>(name: string, args: Record<string, unknown>): Promise<ToolResult<T>> {
  const key = `${name}:${JSON.stringify(args)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return { data: (await hit.value) as T, fromCache: true };
  }

  const value = (async () => {
    const client = await getClient();
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as Array<{ type: string; text?: string }> | undefined;
    const first = content?.[0];
    const text = first && first.type === 'text' ? (first.text ?? null) : null;
    if (!text) throw new Error(`mcp ${name}: empty response`);
    const parsed = JSON.parse(text) as { error?: string };
    if (res.isError || parsed.error) throw new Error(`mcp ${name}: ${parsed.error ?? 'tool error'}`);
    return parsed as T;
  })();

  // Intraday bars go stale fast; M1/M5 feeds are re-read every tick at 1-2s.
  const ttl =
    name === 'get_ohlcv' ? (String(args.interval ?? '').match(/^\d+m$/) ? 2_000 : TTL_MS.get_ohlcv) : (TTL_MS[name] ?? 30_000);
  cache.set(key, { value, expires: Date.now() + ttl });
  value.catch(() => cache.delete(key));
  return { data: await value, fromCache: false };
}

export type QuotePush = { symbol: string; quote?: unknown };

const QuotePushSchema = z.object({
  method: z.literal('notifications/quote'),
  params: z.object({ symbol: z.string(), quote: z.unknown() }),
});

const quotePushListeners = new Set<(push: QuotePush) => void>();

/** Live quote ticks pushed by the bridge ("notifications/quote"). */
export function onQuotePush(cb: (push: QuotePush) => void): () => void {
  quotePushListeners.add(cb);
  return () => quotePushListeners.delete(cb);
}

/** Start the bridge's live quote stream (idempotent; polling stays as fallback). */
export async function startQuoteStream(symbol: string): Promise<void> {
  await callTool('subscribe_quote', { symbol });
}

export async function mcpHealth(): Promise<{ connected: boolean; tools: string[] }> {
  try {
    const client = await getClient();
    const { tools } = await client.listTools();
    return { connected: true, tools: tools.map((t) => t.name) };
  } catch {
    return { connected: false, tools: [] };
  }
}
