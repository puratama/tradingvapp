/**
 * Honest backtests on candles: you write the entry rule, the module applies the protocol
 * (frozen data, no look-ahead, costs, pessimistic fills, IS/OOS split, interchangeable exits,
 * seeded random-entry baseline) and returns a JSON report. It makes no claim of profitability.
 *
 * @module @mathieuc/tradingview/backtest
 */
export { backtest, BACKTEST_DEFAULTS, backtestMany, checkCausality, fetchSnapshot, resolveWarmupBars, runBacktest, } from './run.js';
export { freezeSnapshot, loadSnapshot, snapshotInfo } from './snapshot.js';
export { rsiDivergence } from './signals.js';
export { atrExit, atrTrailingExit, defaultExits, fixedExit } from './exits.js';
export { fillPrice, simulate, splitSegments, tradeReturn } from './simulate.js';
export { computeMetrics, createRng, deriveSeed, percentileRank, quantile, randomBaseline, } from './stats.js';
export { atr, ema, findPivots, rsi, sma } from './indicators.js';
export { formatReport, formatTable, formatWarning, isoTime, tradesToCsv } from './report.js';
export { chartData } from './chart.js';
export { TradingViewError } from '../errors.js';
