import { type AuthHttpOptions } from './request.js';
export interface ScreenerFilter {
    left: string;
    operation: string;
    right?: unknown;
}
export interface ScreenerQuery {
    /** Scanner universe, e.g. america, crypto, forex or global. */
    market?: string;
    /** Exact scanner field names, including optional timeframe suffixes. */
    columns: string[];
    filter?: ScreenerFilter[];
    sort?: {
        sortBy: string;
        sortOrder: 'asc' | 'desc';
    };
    /** Zero-based, end-exclusive page range. Defaults to [0, 50]. */
    range?: [number, number];
    /** Optional exchange-qualified symbols. */
    symbols?: string[];
}
export interface ScreenerRow {
    symbol: string;
    /** Values retain upstream types and nulls; keys match requested columns. */
    values: Record<string, unknown>;
}
export interface ScreenerResult {
    totalCount: number;
    rows: ScreenerRow[];
}
/** One scanner page. This does not subscribe to live prices or grant exchange entitlements. */
export declare function getScreener(query: ScreenerQuery, options?: AuthHttpOptions): Promise<ScreenerResult>;
