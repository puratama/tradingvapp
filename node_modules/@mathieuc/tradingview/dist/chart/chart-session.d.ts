import type { TradingViewClient } from '../client/client.js';
import { TradingViewError } from '../errors.js';
import { Emitter } from '../events.js';
import type { Indicator } from '../indicators/index.js';
import { Study } from './study.js';
import { type Adjustment, type Candle, type ChartType, type ChartTypeInputs, type SymbolInfo, type Timeframe, type Timezone, type TradingSession } from './types.js';
export interface MarketOptions {
    /** Bar resolution. Default: `D`. */
    timeframe?: Timeframe;
    /**
     * Number of bars to load when the series is created. Default: 100.
     * Negative values load bars *after* `to` instead of before it.
     * Only the first `setMarket` of a chart creates the series; later calls
     * keep the loaded bar count (use `fetchMore` or a new chart).
     */
    count?: number;
    /** Reference time (Unix seconds) of the last bar to load. Default: now. */
    to?: number;
    /** Price adjustment. Default: `splits`. */
    adjustment?: Adjustment;
    /** Back-adjust continuous futures contracts. */
    backAdjustment?: boolean;
    /** Trading session (`regular` or `extended`). */
    session?: TradingSession;
    /** Convert prices to a currency, e.g. `EUR`. */
    currency?: string;
    /** Custom bar type (Heikin Ashi, Renko...). */
    type?: ChartType;
    /** Inputs for the custom bar type. */
    inputs?: ChartTypeInputs;
    /** Starts replay mode at this Unix time (seconds). */
    replay?: number;
}
/** `series_completed` details. */
export interface SeriesCompletedInfo {
    /** `streaming` for live data, `replay` in replay mode. */
    status: 'streaming' | 'replay' | (string & {});
    /**
     * Set when no more history can be loaded: `end` (start of history) or
     * `limit` (account limit).
     */
    dataCompleted?: 'end' | 'limit' | (string & {});
    /** Request turnaround ID (`s1`, `s2`...). */
    turnaround: string;
    raw: unknown;
}
export interface ChartEvents {
    [event: string]: unknown[];
    /** Symbol metadata was resolved. */
    symbolLoaded: [info: SymbolInfo];
    /** Bars or studies changed. `changes` lists `$prices` and/or study IDs. */
    update: [changes: string[]];
    /** The server started loading bars. */
    seriesLoading: [];
    /** The requested bars were loaded. Realtime updates continue afterwards. */
    seriesCompleted: [info: SeriesCompletedInfo];
    /** The replay session is ready. */
    replayLoaded: [instanceId: string];
    /** The replay cursor moved (Unix seconds). */
    replayPoint: [time: number];
    /** Resolutions reported by the replay server. */
    replayResolution: [resolution: string, stepResolution: string];
    /** The replay reached the present. */
    replayEnd: [];
    error: [error: TradingViewError];
}
/**
 * A chart: one symbol series plus any number of studies, with optional
 * replay mode. Create it with `client.createChart()`.
 */
export declare class ChartSession extends Emitter<ChartEvents> {
    #private;
    readonly id: string;
    readonly replayId: string;
    readonly client: TradingViewClient;
    constructor(client: TradingViewClient);
    /** Loaded bars, oldest first. */
    get candles(): Candle[];
    /** Most recent bar. */
    get lastCandle(): Candle | undefined;
    /** Symbol metadata, once resolved. */
    get symbolInfo(): SymbolInfo | undefined;
    /** Current timeframe. */
    get timeframe(): Timeframe;
    /** Current series ID (`ser_1`, `ser_2`...), or undefined before `setMarket`. */
    get seriesId(): string | undefined;
    /** True when the chart is in replay mode. */
    get isReplay(): boolean;
    /** True after `delete()` or when the connection closed. */
    get isDeleted(): boolean;
    /** Studies currently on this chart. */
    get studies(): Study[];
    /** Loads a symbol, optionally with a custom bar type or in replay mode. */
    setMarket(symbol: string, options?: MarketOptions): void;
    /** Changes the timeframe of the loaded symbol, keeping studies. */
    setTimeframe(timeframe: Timeframe): void;
    /** Changes the chart timezone. */
    setTimezone(timezone: Timezone): void;
    /**
     * Loads more history. Positive values load older bars; negative values
     * load newer bars after a past `to` reference.
     */
    fetchMore(count?: number): void;
    /** Moves the replay forward by `count` bars. */
    replayStep(count?: number): Promise<void>;
    /** Plays the replay automatically, one bar every `intervalMs`. */
    replayStart(intervalMs?: number): Promise<void>;
    /** Pauses automatic replay. */
    replayStop(): Promise<void>;
    /** Adds a study (Pine or built-in indicator) to this chart. */
    createStudy(indicator: Indicator): Study;
    /** Deletes the chart (and its replay session). Idempotent. */
    delete(): void;
}
