import type { Bar, Baseline, Costs, ExitModel, Metrics, Segment, Trade } from './types.js';
/**
 * - netReturn: compounded return of all closed trades.
 * - winRate: share of trades with a positive net return (null without trades).
 * - profitFactor: gross profit / gross loss in equity terms; null when undefined
 *   (no trade, or no losing trade).
 * - maxDrawdown: largest peak-to-trough fall of equity, marked to market at every bar close
 *   while in a position and at every exit (fraction, positive number).
 */
export declare function computeMetrics(trades: readonly Pick<Trade, 'return' | 'marks'>[]): Metrics;
/** mulberry32: small, fast, seedable PRNG returning floats in [0, 1). */
export declare function createRng(seed: number): () => number;
/** Deterministic 32-bit seed for one (base seed, variant, split) combination (FNV-1a). */
export declare function deriveSeed(...parts: (string | number)[]): number;
/** Linear-interpolated quantile of an ascending array (q in [0, 1]). */
export declare function quantile(sorted: readonly number[], q: number): number | null;
export interface BaselineInput {
    candles: readonly Bar[];
    exit: ExitModel;
    costs: Costs;
    segment: Segment;
    /** Trades each run tries to reach (the strategy's trade count). */
    tradeCount: number;
    /** Probability that a random entry is long. */
    longShare: number;
    runs: number;
    seed: number;
}
/**
 * Random entries on the same eligible bars as the strategy (signal bar and entry bar inside the
 * segment), with the same exit, costs, sizing and one-position rule. Each run draws `tradeCount`
 * distinct entry bars uniformly; entries skipped because a position was open are replaced by
 * bars drawn among the remaining free bars, so the run matches `tradeCount` when the segment
 * has room. Each entry is long with probability `longShare`.
 */
export declare function randomBaseline({ candles, exit, costs, segment, tradeCount, longShare, runs, seed, }: BaselineInput): Baseline;
/** 100 x share of random runs with a strictly lower net return than the strategy. */
export declare function percentileRank(value: number, randomReturns: readonly number[]): number | null;
