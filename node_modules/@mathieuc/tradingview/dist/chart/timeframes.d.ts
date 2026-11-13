import type { Timeframe } from './types.js';
/**
 * Approximate duration of one bar in seconds, or `undefined` for
 * resolutions that are not time-based (ticks, ranges...).
 * Months count as 30 days.
 */
export declare function timeframeSeconds(timeframe: Timeframe): number | undefined;
