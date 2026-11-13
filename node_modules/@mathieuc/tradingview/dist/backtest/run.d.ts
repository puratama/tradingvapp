import type { Timeframe } from '../chart/types.js';
import { type CandleQuery } from '../data/candles.js';
import type { MarketDataProvider } from '../data/provider.js';
import { type Snapshot, type SnapshotInfo } from './snapshot.js';
import type { Bar, Baseline, Direction, ExitModel, ExitReason, Metrics, Segment, Signal, SignalFunction } from './types.js';
export interface BacktestOptions {
    /** Your entry rule. See `SignalFunction`. */
    signal: SignalFunction;
    /** Exits compared on the same entries. Default: `defaultExits()` (four reference exits). */
    exits?: readonly ExitModel[];
    /** Fee per side. Default 0.001 (0.1%). */
    fee?: number;
    /** Adverse slippage per side. Default 0.0005 (0.05%). */
    slippage?: number;
    /** In-sample share of the tradable bars. Default 0.7. */
    splitRatio?: number;
    /**
     * Bars never traded, used only to warm the indicators up. Default: the largest
     * `warmupBars` of the signal and the exits, or 200 when the signal does not declare one.
     */
    warmupBars?: number;
    /** Random-entry runs per exit and split. Default 1000; 0 disables the baseline. */
    runs?: number;
    /** Base seed of the random baseline. Default 42. */
    seed?: number;
    /**
     * Maximum number of signals whose causality is checked by rerunning `signal` on the history
     * that ends at their bar (plus 8 evenly spaced cuts). Default 100; 0 disables the check.
     */
    causalityChecks?: number;
    /** Tradable history wanted, in years: only used for the warning. */
    minYears?: number;
}
export declare const BACKTEST_DEFAULTS: Readonly<{
    fee: 0.001;
    slippage: 0.0005;
    splitRatio: 0.7;
    runs: 1000;
    seed: 42;
    causalityChecks: 100;
    signalWarmupBars: 200;
    minYears: 2;
}>;
export interface SegmentInfo extends Segment {
    bars: number;
    /** Open time of the first bar, Unix seconds. */
    startTime: number | null;
    /** Open time of the last bar, Unix seconds. */
    endTime: number | null;
    /** Buy and hold over the segment: long at the first open, out at the last close, with the same fee and slippage. */
    buyHold: number | null;
}
export interface SignalRecord {
    bar: number;
    time: number;
    direction: Direction;
    entryBar: number;
    entryTime: number | null;
    /** Segment containing both the signal and the entry, or null (warm-up, straddling the split, last bar). */
    split: 'IS' | 'OOS' | null;
    /** Times of the signal's `refs` bars. */
    refs: Record<string, number>;
    /** Bar indices of the signal's `refs` (into `snapshot.candles`). */
    refBars: Record<string, number>;
}
export interface TradeRecord {
    /** Market id, set by `backtestMany` (`<symbol>_<timeframe>`). */
    series?: string;
    exit: string;
    split: 'IS' | 'OOS';
    direction: Direction;
    signalBar: number;
    signalTime: number;
    entryBar: number;
    entryTime: number;
    /** Times of the signal's `refs` bars. */
    refs: Record<string, number>;
    /** Bar indices of the signal's `refs` (into `snapshot.candles`). */
    refBars: Record<string, number>;
    entryOpen: number;
    entryPrice: number;
    initialStop: number;
    target: number | null;
    exitBar: number;
    exitTime: number;
    exitLevel: number;
    exitPrice: number;
    reason: ExitReason;
    return: number;
}
export interface ReportRow {
    exit: string;
    split: 'IS' | 'OOS';
    metrics: Metrics;
    longs: number;
    shorts: number;
    skippedInPosition: number;
    /** Random-entry baseline without the raw returns; null without trades or with `runs: 0`. */
    baseline: Omit<Baseline, 'netReturns'> | null;
    /** 100 x share of random runs with a strictly lower net return; null without a baseline. */
    percentile: number | null;
}
export interface CausalityViolation {
    /** History length the signal function was rerun on (bars `0..cut-1`). */
    cut: number;
    bar: number;
    direction: Direction;
    /** `look_ahead`: present with full history, absent when history ends at `cut - 1`. `repaint`: the reverse. */
    kind: 'look_ahead' | 'repaint';
}
export interface CausalityCheck {
    /** Number of truncated reruns. 0 when disabled. */
    reruns: number;
    /** Signals whose own cut was checked, out of `totalSignals`. */
    checkedSignals: number;
    totalSignals: number;
}
/** Machine-readable warning; `formatReport` turns it into an English sentence. */
export type ReportWarning = {
    code: 'short_history';
    years: number;
    wantedYears: number;
} | {
    code: 'no_signals';
} | {
    code: 'few_trades';
    trades: number;
} | {
    code: 'baseline_unmatched';
    exit: string;
    split: 'IS' | 'OOS';
    matchedRuns: number;
    runs: number;
    trades: number;
    meanTrades: number;
} | {
    code: 'causality_disabled';
} | {
    code: 'data_gaps';
    gaps: number;
    missingBars: number;
};
/**
 * Plain JSON: save it, render it or send it as it is. It holds identifiers and numbers only
 * (exit ids, exit reasons, segment ids, warning codes); the `label` fields are English
 * descriptions for `formatReport`, not interface text.
 */
export interface BacktestReport {
    /** Run time, Unix seconds. */
    createdAt: number;
    library: {
        name: string;
        version: string;
    };
    snapshot: SnapshotInfo;
    settings: {
        signal: {
            id: string;
            params: Record<string, number | string | boolean>;
            label: string;
        };
        fee: number;
        slippage: number;
        splitRatio: number;
        warmupBars: number;
        runs: number;
        seed: number;
        exits: {
            id: string;
            kind: string | null;
            params: Record<string, number | null>;
            label: string;
        }[];
    };
    segments: {
        warmup: SegmentInfo;
        inSample: SegmentInfo;
        outOfSample: SegmentInfo;
    };
    /** Tradable years after warm-up. */
    tradableYears: number;
    signals: SignalRecord[];
    rows: ReportRow[];
    trades: TradeRecord[];
    causality: CausalityCheck;
    /** Few trades, short history, unmatched random runs, gaps... */
    warnings: ReportWarning[];
}
/**
 * Reruns `signal` on truncated copies of the candles and compares the signals it gives up to
 * each cut with those of the full run. A signal must be identical whether or not later bars
 * exist; otherwise it used information from after its bar (look-ahead) or changes when new
 * bars arrive (repaint). Cuts: the bar right after each checked signal (at most `maxSignals`,
 * picked with a seeded draw when there are more) and 8 evenly spaced bars after `fromBar`.
 */
export declare function checkCausality(signal: SignalFunction, candles: readonly Readonly<Required<Bar>>[], options?: {
    fullSignals?: readonly Signal[];
    maxSignals?: number;
    fromBar?: number;
    seed?: number;
}): {
    violations: CausalityViolation[];
    check: CausalityCheck;
};
/** Resolves the warm-up: explicit option, else the largest need of the signal and exits. */
export declare function resolveWarmupBars(signal: SignalFunction, exits: readonly ExitModel[], warmupBars?: number): number;
/**
 * Runs the full protocol on frozen candles, synchronously and without network:
 * causality check of the signal, warm-up, chronological IS/OOS split, every exit on the same
 * entries, costs on both sides, metrics per exit and split, seeded random-entry baseline.
 * Throws a `LOOK_AHEAD` TradingViewError when the signal uses future bars.
 *
 * @example
 * const report = runBacktest(candles, { signal: (bars) => bars.flatMap((b, i) => ...) });
 * console.log(formatReport(report));
 */
export declare function runBacktest(input: Snapshot | readonly Bar[], options: BacktestOptions): BacktestReport;
export interface FetchSnapshotQuery {
    symbol: string;
    timeframe?: Timeframe;
    /** Tradable years wanted after warm-up. Default 2. Ignored with `count` or `from`. */
    years?: number;
    /** Warm-up bars added to the request. Default 200. */
    warmupBars?: number;
    count?: number;
    from?: number;
    to?: number;
    credentials?: CandleQuery['credentials'];
    client?: CandleQuery['client'];
    clientOptions?: CandleQuery['clientOptions'];
    /** Cancels the download. */
    abortSignal?: AbortSignal;
    /** Default 120000: deep history takes several server batches. */
    timeoutMs?: number;
    provider?: MarketDataProvider;
}
/**
 * Downloads candles once with `getCandles` and freezes them (forming bar dropped, gaps and
 * SHA-256 recorded). Save the result with `JSON.stringify` and replay it with `loadSnapshot`.
 */
export declare function fetchSnapshot(query: FetchSnapshotQuery): Promise<Snapshot>;
export type BacktestQuery = FetchSnapshotQuery & Omit<BacktestOptions, 'minYears'> & {
    /** Replay a saved snapshot instead of downloading candles. */
    snapshot?: Snapshot;
};
/**
 * One call: download (or replay) the candles, freeze them, run the whole protocol.
 * Returns the JSON report and the frozen snapshot (candles included, for charts and replays).
 *
 * @example
 * import { backtest, formatReport } from '@mathieuc/tradingview/backtest';
 * const { report, snapshot } = await backtest({
 *   symbol: 'BINANCE:BTCUSDT', timeframe: '240', years: 2,
 *   signal: (candles) => candles.flatMap((c, i) => (i > 0 && c.close > candles[i - 1].high ? [{ bar: i, direction: 'long' }] : [])),
 * });
 * console.log(formatReport(report));
 * writeFileSync('snapshot.json', JSON.stringify(snapshot)); // Replay later with { snapshot: loadSnapshot(...) }
 */
export declare function backtest(query: BacktestQuery): Promise<{
    report: BacktestReport;
    snapshot: Snapshot;
}>;
export interface Market {
    symbol: string;
    timeframe: Timeframe;
    /** Replay a saved snapshot for this market instead of downloading it. */
    snapshot?: Snapshot;
}
export type BacktestManyQuery = Omit<BacktestQuery, 'symbol' | 'timeframe' | 'snapshot' | 'exits'> & {
    markets: readonly Market[];
    /** Same exits everywhere, or exits per market (a wider stop on daily bars...). */
    exits?: readonly ExitModel[] | ((market: Market) => readonly ExitModel[]);
};
export interface MarketResult {
    /** `<symbol>_<timeframe>`, also set as `series` on each trade. */
    id: string;
    symbol: string;
    timeframe: Timeframe;
    report: BacktestReport;
    snapshot: Snapshot;
}
/**
 * The same signal on several markets, one after the other (one download each, or a replay).
 * Every trade gets `series` = the market id, so `tradesToCsv(results.flatMap((r) => r.report.trades))`
 * gives one CSV for all of them.
 */
export declare function backtestMany(query: BacktestManyQuery): Promise<MarketResult[]>;
