import { type Credentials, type HttpOptions } from './request.js';
import { type ScreenerQuery, type ScreenerResult } from './screener.js';
export interface Watchlist {
    id: number;
    name: string;
    /** Ordered upstream entries, including any section markers. */
    symbols: string[];
    /** Additional upstream metadata, preserved without coercion. */
    [key: string]: unknown;
}
export interface WatchlistOptions extends HttpOptions {
    credentials: Credentials;
}
/** Reads all watchlists belonging to the authenticated account. Never modifies them. */
export declare function getWatchlists(options: WatchlistOptions): Promise<Watchlist[]>;
export type HotlistKind = 'gainers' | 'losers' | 'mostActive' | 'volumeGainers';
export interface HotlistQuery extends Omit<ScreenerQuery, 'columns' | 'sort'> {
    kind: HotlistKind;
    columns?: string[];
}
/** Scanner-ranked lists, not a promise of parity with the TradingView UI hotlist widget. */
export declare function getHotlist(query: HotlistQuery, options?: HttpOptions): Promise<ScreenerResult>;
