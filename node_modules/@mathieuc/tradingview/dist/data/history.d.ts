import type { ChartSession, MarketOptions, SeriesCompletedInfo } from '../chart/chart-session.js';
import type { Adjustment, Candle, ChartType, ChartTypeInputs, Timeframe, Timezone, TradingSession } from '../chart/types.js';
import { TradingViewError } from '../errors.js';
/** Chart settings shared by candle and indicator queries. */
export interface ChartQuery {
    /** Exchange-qualified symbol, e.g. `BINANCE:BTCUSDT`. */
    symbol: string;
    /** Bar resolution (`1`, `15`, `60`, `240`, `D`, `W`, `M`, `1S`...). Default: `D`. */
    timeframe?: Timeframe;
    /** Number of most recent bars. Default: 100. */
    count?: number;
    /** Custom bar type: `HeikinAshi`, `Renko`, `LineBreak`, `Kagi`, `PointAndFigure` or `Range`. */
    chartType?: ChartType;
    /** Inputs for `chartType`. */
    chartInputs?: ChartTypeInputs;
    /** Convert prices to this currency, e.g. `EUR`. */
    currency?: string;
    /** `regular` or `extended` trading session. */
    session?: TradingSession;
    /** Price adjustment. Default: `splits`. */
    adjustment?: Adjustment;
    /** Back-adjust continuous futures contracts. */
    backAdjustment?: boolean;
    /** Chart timezone (affects how daily and longer bars are aligned). */
    timezone?: Timezone;
}
/** Historical range options. */
export interface RangeQuery {
    /**
     * Oldest bar time (Date or Unix seconds). When set, history is loaded back
     * to this time (deep history) and `count` is ignored.
     */
    from?: number | Date;
    /** Newest bar time (Date or Unix seconds). Default: now. */
    to?: number | Date;
    /** Safety cap on bars loaded for a `from` range. Default: 20 000. */
    maxCount?: number;
}
export interface HistoryPlan {
    symbol: string;
    market: MarketOptions;
    timezone?: Timezone;
    count: number;
    from?: number;
    to?: number;
    maxCount: number;
}
/** Validates a query and computes how many bars to request first. */
export declare function planHistory(query: ChartQuery & RangeQuery): HistoryPlan;
/** Selects the requested bars from everything loaded on a chart. */
export declare function selectCandles(candles: Candle[], plan: Pick<HistoryPlan, 'from' | 'to' | 'count'>): Candle[];
/** Opens the market on a chart according to a plan. */
export declare function openMarket(chart: ChartSession, plan: HistoryPlan): void;
/**
 * Loads history: after each `series_completed`, requests more bars until the
 * plan is satisfied or the server has no more data. `onDone` receives the
 * last completion info.
 */
export declare function loadHistory(chart: ChartSession, plan: HistoryPlan, deep: boolean, onDone: (info: SeriesCompletedInfo) => void): () => void;
/** Error for an empty result, with the server's reason when known. */
export declare function noDataError(symbol: string, info?: SeriesCompletedInfo): TradingViewError;
