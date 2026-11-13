import { type HttpOptions } from './request.js';
export type MarketType = 'stock' | 'futures' | 'forex' | 'cfd' | 'crypto' | 'index' | 'economic' | 'bond' | 'fund' | (string & {});
/** One market returned by `searchMarkets`. */
export interface MarketSearchResult {
    /** Exchange-qualified symbol, usable everywhere in this library (`BINANCE:BTCEUR`). */
    id: string;
    /** Short exchange name (`BINANCE`). */
    exchange: string;
    /** Exchange name as sent by TradingView. */
    fullExchange: string;
    symbol: string;
    description: string;
    type: string;
    currency?: string;
    country?: string;
}
export interface SearchMarketsOptions extends HttpOptions {
    /** Restricts results to a market type. */
    type?: MarketType;
    /** Restricts results to an ISO country code, such as `US`. */
    country?: string;
    /** Restricts results to a sector, such as `Finance`. */
    sector?: string;
    /** Pagination offset. */
    offset?: number;
    /** Restricts results to an exchange. `searchMarkets('BINANCE:BTC')` sets it too. */
    exchange?: string;
}
/** Searches markets by keywords, `EXCHANGE:` prefix or `EXCHANGE:SYMBOL`. */
export declare function searchMarkets(query: string, options?: SearchMarketsOptions): Promise<MarketSearchResult[]>;
/**
 * TradingView technical ratings, from -1 (strong sell) to 1 (strong buy).
 * `All` is the summary, `MA` the moving averages and `Other` the oscillators.
 */
export interface TechnicalRating {
    Other: number;
    All: number;
    MA: number;
}
export type TechnicalAnalysisPeriod = '1' | '5' | '15' | '60' | '240' | '1D' | '1W' | '1M';
export type TechnicalAnalysis = Record<TechnicalAnalysisPeriod, TechnicalRating>;
/**
 * Gets technical ratings for every period from the TradingView scanner.
 * Returns `null` when the scanner has no data for the symbol.
 *
 * Values are scaled like the historical API: `round(raw * 1000) / 500`,
 * which maps the scanner range [-1, 1] to [-2, 2].
 */
export declare function getTechnicalAnalysis(symbol: string, options?: HttpOptions): Promise<TechnicalAnalysis | null>;
