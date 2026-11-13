import type { ExitModel } from './types.js';
export interface FixedExitOptions {
    /** Stop distance from the entry bar open, as a fraction (0.02 = 2%). */
    stopPct: number;
    /** Target at this multiple of the stop distance; null for a stop only. */
    targetR: number | null;
}
/** Fixed stop at `stopPct` from the entry bar open, target at `targetR` times that distance. */
export declare function fixedExit({ stopPct, targetR }: FixedExitOptions): ExitModel;
export interface AtrExitOptions {
    /** Stop at `mult` x ATR of the signal bar. */
    mult: number;
    /** Target at this multiple of the stop distance; null for a stop only. */
    targetR: number | null;
    /** ATR length (Wilder). Default 14. */
    length?: number;
}
/** Stop at `mult` x ATR of the signal bar (last closed bar before entry), target at `targetR` R. */
export declare function atrExit({ mult, targetR, length }: AtrExitOptions): ExitModel;
export interface AtrTrailingExitOptions {
    /** Distance from the close, in ATR. */
    mult: number;
    /** ATR length (Wilder). Default 14. */
    length?: number;
}
/**
 * ATR trailing stop, no target. Initial stop at `mult` x ATR of the signal bar, then, after
 * each CLOSED bar, ratcheted to close -/+ `mult` x ATR of that bar; the new stop applies from
 * the next bar.
 */
export declare function atrTrailingExit({ mult, length }: AtrTrailingExitOptions): ExitModel;
export interface DefaultExitOptions {
    /** Stop distance of the two fixed exits. Default 0.02. */
    stopPct?: number;
    /** ATR exit stop multiplier. Default 1.5. */
    atrStopMult?: number;
    /** ATR exit target in R. Default 2. */
    atrTargetR?: number;
    /** ATR trailing stop multiplier. Default 3. */
    trailAtrMult?: number;
    /** ATR length. Default 14. */
    atrLength?: number;
}
/**
 * The four reference exits: fixed 2% stop with 1.5:1 and 2:1 targets, 1.5 x ATR stop with a
 * 2R target, and a 3 x ATR trailing stop.
 */
export declare function defaultExits(options?: DefaultExitOptions): ExitModel[];
