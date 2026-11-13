import type { BacktestReport, SignalRecord, TradeRecord } from './run.js';
import type { Snapshot } from './snapshot.js';
import type { SignalFunction } from './types.js';
export interface ChartData {
    /** Frozen candles, oldest first; every `*Bar` index in the report points into this array. */
    bars: {
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
    }[];
    /** Indicator series from `signal.indicators`, one value per bar, null when undefined. */
    indicators: Record<string, (number | null)[]>;
    /** Open time of the first traded bar (end of the warm-up), Unix seconds. */
    warmupEndTime: number | null;
    /** Open time of the first out-of-sample bar, Unix seconds. */
    splitTime: number | null;
    signals: SignalRecord[];
    /** Trades by exit id, in entry order. */
    trades: Record<string, TradeRecord[]>;
}
/**
 * Everything a price chart needs, in one JSON object: candles, indicator lines, warm-up and
 * split times, signals with their `refBars`, and the trades of each exit. Pass the same signal
 * function as the run to get its indicators (for `rsiDivergence`: `rsi` and `ema`).
 */
export declare function chartData(report: BacktestReport, snapshot: Snapshot, signal?: SignalFunction): ChartData;
