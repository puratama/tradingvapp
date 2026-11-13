import type { TradingSession } from '../chart/types.js';
import type { QuoteData, QuoteField, QuoteFieldPreset } from '../quote/fields.js';
import { type OperationOptions, type WatchHandlers, type Watcher } from './operation.js';
export interface QuoteOptions extends OperationOptions {
    /** `all` (default), `price`, or a list of fields. */
    fields?: QuoteFieldPreset | readonly QuoteField[];
    /** Trading session. Default: `regular`. */
    session?: TradingSession;
}
export interface QuoteQuery extends QuoteOptions {
    symbol: string;
}
export interface QuotesQuery extends QuoteOptions {
    symbols: readonly string[];
}
/** Gets quotes for several symbols at once, keyed by symbol. */
export declare function getQuotes(query: QuotesQuery | readonly string[]): Promise<Record<string, QuoteData>>;
/** Gets the current quote of a symbol (last price, change, volume...). */
export declare function getQuote(query: QuoteQuery | string): Promise<QuoteData>;
export interface QuoteHandlers extends WatchHandlers {
    /** Receives the merged quote and the fields that changed. */
    onData(symbol: string, quote: QuoteData, changes: QuoteData): void;
}
export interface QuoteWatcher extends Watcher {
    /** Latest quote per symbol. */
    readonly latest: Readonly<Record<string, QuoteData>>;
}
/**
 * Streams quotes for one or more symbols. Resolves once every symbol has
 * loaded (or failed: failures go to `onError`; if every symbol fails, the
 * promise rejects). Call `stop()` when finished.
 */
export declare function watchQuotes(query: QuotesQuery, handlers: QuoteHandlers): Promise<QuoteWatcher>;
