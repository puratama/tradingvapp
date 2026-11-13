import { TradingViewError } from '../errors.js';
import { Emitter } from '../events.js';
import type { Indicator } from '../indicators/index.js';
import type { ServerPacket } from '../protocol/framing.js';
import { type GraphicsData } from './graphics.js';
import { type StrategyReport, type StrategyReportChange } from './strategy.js';
/** One study row: `$time` (Unix seconds) plus one entry per plot. */
export interface StudyValue {
    $time: number;
    [plot: string]: number;
}
export type StudyChange = 'plots' | 'graphic' | StrategyReportChange;
export interface StudyEvents {
    [event: string]: unknown[];
    /** The server started (re)computing the study. */
    loading: [];
    /** The study finished computing over the loaded bars. */
    ready: [];
    update: [changes: StudyChange[]];
    error: [error: TradingViewError];
}
/** @internal Link between a study and its chart. */
export interface StudyBridge {
    chartId: string;
    send(method: string, params: unknown[]): void;
    barsBack(): Map<number, number>;
    log(...args: unknown[]): void;
    unregister(id: string): void;
}
/** An indicator running on a chart. Create it with `chart.createStudy(indicator)`. */
export declare class Study extends Emitter<StudyEvents> {
    #private;
    readonly id: string;
    /** @internal Use `chart.createStudy()`. */
    constructor(bridge: StudyBridge, indicator: Indicator);
    /** @internal */
    create(): void;
    /** The indicator definition running in this study. */
    get indicator(): Indicator;
    /** True after the first `study_completed`. */
    get isReady(): boolean;
    /** True after `remove()` or when the chart is gone. */
    get isRemoved(): boolean;
    /** Plot values, oldest first. */
    get values(): StudyValue[];
    /** Drawings (labels, lines, boxes, tables...) produced by the indicator. */
    get graphics(): GraphicsData;
    /** Strategy report (Pine strategies only). */
    get strategyReport(): StrategyReport;
    /** Replaces the indicator (typically the same script with new inputs). */
    setIndicator(indicator: Indicator): void;
    /** Removes the study from the chart. Idempotent. */
    remove(): void;
    /** @internal Called when the chart or connection is gone; `error` is reported if set. */
    dispose(error?: TradingViewError): void;
    /** @internal Packets addressed to this study (`study_*`). */
    onPacket(packet: ServerPacket): void;
    /** @internal Data from `timescale_update` / `du`. */
    onData(data: any): void;
}
