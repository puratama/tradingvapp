import type { Candle, SymbolInfo } from '../chart/types.js';
import type { CandleSourceWorker, MarketDataProvider } from './provider.js';
import { type ChartQuery, type RangeQuery } from './history.js';
import { type OperationOptions, type WatchHandlers, type Watcher } from './operation.js';
export interface CandleQuery extends ChartQuery, RangeQuery, OperationOptions {
}
/**
 * Fetches candles once, oldest first, then releases every resource.
 *
 * - `{ symbol, timeframe, count }`: the `count` most recent bars (deep history
 *   is loaded automatically when `count` exceeds one server batch).
 * - `{ symbol, timeframe, from, to }`: every bar in the range.
 *
 * @example
 * const candles = await getCandles({ symbol: 'BINANCE:BTCUSDT', timeframe: '60', count: 500 });
 */
export declare function getCandles(query: CandleQuery | string, provider?: MarketDataProvider): Promise<Candle[]>;
export type WatchCandlesQuery = ChartQuery & OperationOptions;
export interface CandleHandlers extends WatchHandlers {
    /** Receives a fresh immutable snapshot (oldest first) on every update. */
    onData(candles: readonly Candle[]): void;
}
export interface CandleWatcher extends Watcher {
    /** Latest snapshot, oldest first (at most `count` bars). */
    readonly latest: readonly Candle[];
    /** Symbol metadata. */
    readonly symbolInfo: SymbolInfo | undefined;
}
/**
 * Streams candles in real time. Resolves once the initial history is loaded
 * (and already passed to `onData`); call `stop()` when finished.
 *
 * @example
 * const watcher = await watchCandles({ symbol: 'BINANCE:BTCUSDT', timeframe: '1' }, {
 *   onData: (candles) => console.log(candles.at(-1)?.close),
 * });
 * await watcher.stop();
 */
export declare function watchCandles(query: WatchCandlesQuery, handlers: CandleHandlers): Promise<CandleWatcher>;
export declare function watchCandles(query: WatchCandlesQuery, handlers: CandleHandlers, provider: MarketDataProvider): Promise<CandleSourceWorker>;
