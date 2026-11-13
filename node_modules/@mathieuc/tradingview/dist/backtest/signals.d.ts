import type { SignalFunction } from './types.js';
export interface RsiDivergenceOptions {
    /** Default 14. */
    rsiLength?: number;
    /** Trend filter EMA length. Default 200. */
    emaLength?: number;
    /** Bars on each side of a pivot; it is confirmed this many bars later. Default 5. */
    pivotLookback?: number;
    /** Bars between the two pivots of a divergence. Default 5 to 60. */
    minPivotDistance?: number;
    maxPivotDistance?: number;
    /** Apply the EMA trend filter. Default true; false gives every divergence (to count the raw setups). */
    trendFilter?: boolean;
}
/**
 * Regular RSI divergence with an EMA trend filter, the reference strategy of the protocol.
 * For each newly confirmed pivot, compare it with the previous pivot of the same kind:
 * - long: lower price low, higher RSI low, and close above the EMA on the confirmation bar;
 * - short: higher price high, lower RSI high, and close below the EMA on the confirmation bar.
 * The signal fires at the close of the confirmation bar (`pivot + pivotLookback`), never on
 * the pivot itself. `refs` carries the two pivots.
 */
export declare function rsiDivergence(options?: RsiDivergenceOptions): SignalFunction;
