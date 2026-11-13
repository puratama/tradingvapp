import type { Bar } from './types.js';
export interface Gap {
    afterTime: number;
    beforeTime: number;
    missingBars: number;
}
export interface SnapshotInfo {
    readonly symbol: string;
    readonly timeframe: string;
    readonly barSeconds: number;
    readonly count: number;
    readonly firstTime: number;
    readonly lastTime: number;
    readonly spanYears: number;
    readonly gaps: readonly Gap[];
    readonly droppedFormingBar: boolean;
    /** SHA-256 of the frozen candles: two runs on the same hash saw the same data. */
    readonly sha256: string;
    /** When the candles were downloaded or frozen, Unix seconds; null for older saved snapshots. */
    readonly fetchedAt: number | null;
}
/** Validated, frozen candles. Save it (`JSON.stringify`) to replay a run exactly. */
export interface Snapshot extends SnapshotInfo {
    readonly candles: readonly Readonly<Required<Bar>>[];
}
export interface SnapshotMeta {
    symbol?: string;
    timeframe?: string;
    /** Bar duration in seconds. Inferred from the most common interval when omitted. */
    barSeconds?: number;
    /** Current time in Unix seconds, to detect the bar still forming. Defaults to now. */
    now?: number;
    /** Download time, Unix seconds. Defaults to now. */
    fetchedAt?: number | null;
}
/**
 * Validates candles once and freezes them. The bar that is still forming (its close time is
 * after `now`) is dropped: its high, low and close are not final yet.
 * Gaps are intervals longer than 1.5 bars (market closures also show up as gaps).
 */
export declare function freezeSnapshot(rawCandles: readonly Bar[], meta?: SnapshotMeta): Snapshot;
/**
 * Restores a snapshot saved with `JSON.stringify(snapshot)` and checks its SHA-256,
 * so that a replay runs on exactly the same data.
 */
export declare function loadSnapshot(saved: Snapshot | string): Snapshot;
/** Snapshot metadata without the candles. */
export declare function snapshotInfo(snapshot: Snapshot): SnapshotInfo;
