import type { GraphicsData } from '../chart/graphics.js';
import type { StrategyReport } from '../chart/strategy.js';
import type { StudyValue } from '../chart/study.js';
import type { Candle } from '../chart/types.js';
import type { Indicator } from '../indicators/index.js';
import { type ChartQuery } from './history.js';
import { type OperationOptions, type WatchHandlers, type Watcher } from './operation.js';
export interface IndicatorQuery extends ChartQuery, OperationOptions {
    /**
     * Indicator to run: a script ID (`STD;RSI`, `PUB;xxxx`, `USER;xxxx`), a
     * built-in study type (`Volume@tv-basicstudies-241`), or an instance.
     */
    indicator: string | Indicator;
    /** Script version when `indicator` is a script ID. Default: `last`. */
    version?: string;
    /** Input values (Pine) or options (built-in) to apply. */
    inputs?: Record<string, unknown>;
    /** Newest bar time (Date or Unix seconds). Default: now. */
    to?: number | Date;
}
export interface IndicatorData {
    indicator: Indicator;
    /** Chart bars, oldest first. */
    candles: Candle[];
    /**
     * Plot values, oldest first. The server may compute a few rows before the
     * first returned candle.
     */
    values: StudyValue[];
    /** Drawings (labels, lines, boxes, tables...). */
    graphics: GraphicsData;
    /** Strategy report (strategies only; otherwise empty). */
    strategyReport: StrategyReport;
}
/** Resolves an indicator ID or instance and applies inputs. */
export declare function resolveIndicator(query: IndicatorQuery): Promise<Indicator>;
/**
 * Runs an indicator or strategy once and returns its values, drawings and
 * strategy report.
 *
 * @example
 * const { values } = await getIndicatorData({ symbol: 'BINANCE:BTCUSDT', indicator: 'STD;RSI' });
 */
export declare function getIndicatorData(query: IndicatorQuery): Promise<IndicatorData>;
export interface IndicatorHandlers extends WatchHandlers {
    /** Receives a fresh result on every study update. */
    onData(data: IndicatorData): void;
}
export interface IndicatorWatcher extends Watcher {
    /** Latest result. */
    readonly latest: IndicatorData | undefined;
}
/** Streams an indicator in real time. Call `stop()` when finished. */
export declare function watchIndicator(query: IndicatorQuery, handlers: IndicatorHandlers): Promise<IndicatorWatcher>;
