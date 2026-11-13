/**
 * High-level data API: one-shot functions and watchers that manage
 * connections, sessions, timeouts and cleanup for you.
 *
 * @module @mathieuc/tradingview/data
 */
export { getCandles, watchCandles } from './candles.js';
export { TradingViewProvider } from './provider.js';
export { getQuote, getQuotes, watchQuotes } from './quotes.js';
export { getSymbolInfo } from './symbols.js';
export { getIndicatorData, watchIndicator } from './indicators.js';
export { DEFAULT_TIMEOUT_MS } from './operation.js';
// Plain HTTP lookups are already one-shot; they are part of the data API too.
export { getTechnicalAnalysis, searchIndicators, searchMarkets, } from '../http/index.js';
export { TradingViewError } from '../errors.js';
export { summarizeStrategyReport } from '../chart/strategy.js';
export { getScreener } from '../http/screener.js';
export { getWatchlists, getHotlist } from '../http/watchlists.js';
