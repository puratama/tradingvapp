import type { Bar } from './types.js';
/** Simple moving average. First value at index `length - 1`. */
export declare function sma(values: readonly number[], length: number): number[];
/** EMA seeded with the SMA of the first `length` values. First value at index `length - 1`. */
export declare function ema(values: readonly number[], length: number): number[];
/** Wilder RSI. First value at index `length`. */
export declare function rsi(closes: readonly number[], length: number): number[];
/** Wilder ATR. First value at index `length - 1`. */
export declare function atr(candles: readonly Bar[], length: number): number[];
export interface Pivot {
    /** Bar of the pivot itself. */
    bar: number;
    /** First bar at whose close the pivot is known: `bar + lookback`. */
    confirmBar: number;
    price: number;
}
/**
 * A pivot low at bar p: lower than the `lookback` bars before it and not higher than the
 * `lookback` bars after it (mirror for highs). It needs those later bars, so it is only
 * known at the close of `confirmBar = p + lookback`. Never use it earlier.
 */
export declare function findPivots(values: readonly number[], lookback: number, kind: 'low' | 'high'): Pivot[];
/** ATR memoised per candle array, so that several exits share one computation. */
export declare function cachedAtr(candles: readonly Bar[], length: number): number[];
