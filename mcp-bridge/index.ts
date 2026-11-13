/**
 * MCP server "tradingview-lite" — exposes TradingView market data tools
 * over stdio, mirroring the official TradingView MCP tool names so the
 * backend can later point at https://mcp.tradingview.com/mcp unchanged.
 *
 * Data sources (free, no account):
 *  - candles/quotes/TA : @mathieuc/tradingview (TradingView chart websocket)
 *  - economic calendar : ForexFactory public JSON feed
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TradingViewClient, getCandles, getQuote, getTechnicalAnalysis, searchMarkets, watchQuotes } from '@mathieuc/tradingview';
import { z } from 'zod';
import { fetchEconomicCalendar } from './forexfactory.js';

/** TradingView-style interval -> @mathieuc timeframe code. */
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '1D': 'D',
  '1W': 'W',
  '1M': 'M',
};

const server = new McpServer({ name: 'tradingview-lite', version: '0.1.0' });

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

// One shared websocket for every TradingView call: without `client` each call
// opens and closes its own connection and the churn trips TradingView's 429.
let tvClient: TradingViewClient | null = null;
function getTvClient(): TradingViewClient {
  if (!tvClient || tvClient.isClosed) tvClient = new TradingViewClient();
  return tvClient;
}

server.registerTool(
  'get_ohlcv',
  {
    title: 'OHLCV candles',
    description:
      'Historical OHLCV bars for a symbol. Returns { symbol, interval, bars: [{time,open,high,low,close,volume}] } oldest first; time is Unix seconds UTC.',
    inputSchema: {
      symbol: z.string().describe('Exchange-qualified symbol, e.g. OANDA:XAUUSD'),
      interval: z
        .string()
        .default('1h')
        .describe('Bar interval: 1m 5m 15m 30m 1h 2h 4h 1D 1W 1M'),
      count: z.number().int().min(1).max(5000).default(300).describe('Number of most recent bars'),
    },
  },
  async ({ symbol, interval, count }) => {
    try {
      const timeframe = INTERVAL_MAP[interval] ?? interval;
      const candles = await getCandles({ symbol, timeframe, count, client: getTvClient() });
      return jsonResult({ symbol, interval, bars: candles });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_quote',
  {
    title: 'Real-time quote',
    description:
      'Current quote for a symbol. Returns { symbol, lp, ch, chp, bid, ask, high_price, low_price, open_price, prev_close_price, lp_time }.',
    inputSchema: { symbol: z.string().describe('Exchange-qualified symbol, e.g. OANDA:XAUUSD') },
  },
  async ({ symbol }) => {
    try {
      return jsonResult({ symbol, ...(await getQuote({ symbol, client: getTvClient() })) });
    } catch (err) {
      return errorResult(err);
    }
  },
);

/** Live quote watchers per symbol; tick updates go out as MCP notifications. */
const quoteWatchers = new Set<string>();

server.registerTool(
  'subscribe_quote',
  {
    title: 'Live quote stream',
    description:
      'Start streaming live quote updates for a symbol. Each update is sent as an MCP notification "notifications/quote" with params { symbol, quote }. Idempotent.',
    inputSchema: { symbol: z.string().describe('Exchange-qualified symbol, e.g. OANDA:XAUUSD') },
  },
  async ({ symbol }) => {
    try {
      if (quoteWatchers.has(symbol)) return jsonResult({ symbol, subscribed: true, already: true });
      quoteWatchers.add(symbol);
      await watchQuotes({ symbols: [symbol], client: getTvClient() }, {
        onData(sym, quote) {
          void server.server
            .notification({ method: 'notifications/quote', params: { symbol: sym, quote } })
            .catch((err) => console.error('[bridge] quote notify:', err instanceof Error ? err.message : err));
        },
        onError(err) {
          console.error('[bridge] quote watch:', err instanceof Error ? err.message : err);
          quoteWatchers.delete(symbol);
        },
      });
      return jsonResult({ symbol, subscribed: true });
    } catch (err) {
      quoteWatchers.delete(symbol);
      return errorResult(err);
    }
  },
);

server.registerTool(
  'search_symbol',
  {
    title: 'Symbol search',
    description: 'Fuzzy-search markets by text. Returns id, exchange, symbol, description, type, currency.',
    inputSchema: {
      query: z.string().describe('Ticker or name, e.g. XAUUSD or gold'),
      type: z
        .enum(['stock', 'crypto', 'forex', 'futures', 'index', 'cfd', 'economic'])
        .optional()
        .describe('Restrict instrument type'),
    },
  },
  async ({ query, type }) => {
    try {
      return jsonResult(await searchMarkets(query, type ? { type } : undefined));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_technical_analysis',
  {
    title: 'Technical analysis ratings',
    description:
      'TradingView technical ratings per timeframe. Each entry has All/MA/Other aggregates in [-2..2] (strong sell..strong buy).',
    inputSchema: { symbol: z.string().describe('Exchange-qualified symbol, e.g. OANDA:XAUUSD') },
  },
  async ({ symbol }) => {
    try {
      return jsonResult(await getTechnicalAnalysis(symbol));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_economic_calendar',
  {
    title: 'Economic calendar',
    description:
      'Upcoming macro events (CPI, NFP, FOMC...). Returns raw events { title, country, date, impact, forecast, previous, actual }.',
    inputSchema: {
      currencies: z
        .array(z.string())
        .optional()
        .describe('Filter by currency/country codes, e.g. ["USD","EUR"]'),
      min_importance: z
        .number()
        .int()
        .min(-1)
        .max(1)
        .default(-1)
        .describe('Minimum importance: -1 all, 0 medium+high, 1 high only'),
      date_from: z.string().optional().describe('ISO date/time lower bound'),
      date_to: z.string().optional().describe('ISO date/time upper bound'),
    },
  },
  async ({ currencies, min_importance, date_from, date_to }) => {
    try {
      const events = await fetchEconomicCalendar({
        currencies,
        minImportance: min_importance,
        dateFrom: date_from,
        dateTo: date_to,
      });
      return jsonResult({ count: events.length, events });
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('tradingview-lite MCP server ready (stdio)');
