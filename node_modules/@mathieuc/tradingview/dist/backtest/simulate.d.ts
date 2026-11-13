import type { Bar, Costs, Direction, Entry, ExitModel, Segment, Trade } from './types.js';
/**
 * Bars before `warmupBars` only warm the indicators up. The remaining bars are split
 * chronologically: in-sample `[start, splitBar)`, out-of-sample `[splitBar, end)`.
 */
export declare function splitSegments(barCount: number, warmupBars: number, ratio: number): {
    inSample: Segment;
    outOfSample: Segment;
};
/** Fill price after adverse slippage. */
export declare function fillPrice(side: 'entry' | 'exit', direction: Direction, price: number, slippage: number): number;
/**
 * Return on equity of one trade (100% of equity, no leverage), after slippage on both fills
 * and a fee on the notional of each side.
 */
export declare function tradeReturn(direction: Direction, entryFill: number, exitFill: number, fee: number): number;
export interface SimulateInput {
    candles: readonly Bar[];
    /** Sorted by `entryBar`. */
    entries: readonly Entry[];
    exit: ExitModel;
    costs: Costs;
    segment: Segment;
    maxTrades?: number;
    /** Record the stop in force on every bar of each trade. */
    trace?: boolean;
}
export interface SimulateResult {
    trades: Trade[];
    /** Entries skipped because a position was already open. */
    skippedInPosition: number;
    /** Entries whose signal bar or entry bar is outside the segment. */
    outsideSegment: number;
    /** Entries for which the exit returned no levels (ATR not defined yet...). */
    invalidLevels: number;
}
/**
 * Simulates entries inside one segment, one position at a time, 100% of equity, no leverage.
 * An entry is taken only if its signal bar and entry bar are inside the segment and the
 * previous trade exited on an earlier bar. A trade still open on the last bar of the segment
 * is closed at that bar's close (`segment_end`), so no position crosses a segment boundary.
 */
export declare function simulate({ candles, entries, exit, costs, segment, maxTrades, trace, }: SimulateInput): SimulateResult;
