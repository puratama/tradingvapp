import { PineIndicator } from '../indicators/pine-indicator.js';
import { type AuthHttpOptions, type Credentials, type HttpOptions } from './request.js';
export type IndicatorAccess = 'open_source' | 'closed_source' | 'invite_only' | 'private' | 'other';
/** An indicator returned by `searchIndicators` or `getPrivateIndicators`. */
export interface IndicatorSearchResult {
    /** Script ID to pass to `getIndicator`. */
    id: string;
    version: string;
    name: string;
    author: {
        id: number;
        username: string;
    };
    /** Chart image ID: `https://www.tradingview.com/i/<image>`. */
    image: string;
    /** Pine source, when public. */
    source: string;
    type: 'study' | 'strategy' | (string & {});
    access: IndicatorAccess;
}
/** Clears the in-memory list of built-in indicators used by `searchIndicators`. */
export declare function clearIndicatorCache(): void;
/** Searches built-in and community indicators. */
export declare function searchIndicators(query?: string, options?: HttpOptions): Promise<IndicatorSearchResult[]>;
export interface GetIndicatorOptions extends AuthHttpOptions {
    /** Script version. Default: `last`. */
    version?: string;
}
/**
 * The compiled script (`ILScript`) of a `pine-facade/translate` result.
 *
 * TradingView moved it twice in October 2026: `result.ilTemplate` (historical),
 * then the `defval` of the hidden `text` input (27 Oct), then
 * `metaInfo.defaults.inputs.text` (by 30 Oct). All three are read, newest
 * shape last, so a rollback on their side keeps working too. Without it the
 * chart server answers `study_error` "Can't parse pine".
 */
export declare function compiledScriptOf(result: any): string | undefined;
/** Converts a `pine-facade/translate` result into a `PineIndicator`. */
export declare function parseIndicatorDefinition(result: any, id: string, version: string): PineIndicator;
/**
 * Loads an indicator definition (`STD;RSI`, `PUB;xxxx`, `USER;xxxx`...).
 * Private and invite-only scripts need credentials with access.
 */
export declare function getIndicator(id: string, options?: GetIndicatorOptions): Promise<PineIndicator>;
/** Lists the private (saved) indicators of an account. */
export declare function getPrivateIndicators(credentials: Credentials, options?: HttpOptions): Promise<IndicatorSearchResult[]>;
