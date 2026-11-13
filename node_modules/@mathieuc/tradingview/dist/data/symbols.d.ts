import type { SymbolInfo, TradingSession } from '../chart/types.js';
import { type OperationOptions } from './operation.js';
export interface SymbolInfoQuery extends OperationOptions {
    symbol: string;
    session?: TradingSession;
    currency?: string;
}
/** Resolves a symbol: exchange, currency, session, price scale, type... */
export declare function getSymbolInfo(query: SymbolInfoQuery | string): Promise<SymbolInfo>;
