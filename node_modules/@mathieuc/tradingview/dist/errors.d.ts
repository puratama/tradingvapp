/** Machine-readable error categories raised by this library. */
export type TradingViewErrorCode = 
/** The server rejected a websocket packet and closed the connection. */
'PROTOCOL_ERROR'
/** The websocket could not be opened or failed. */
 | 'CONNECTION_ERROR'
/** The websocket closed while an operation was still waiting for data. */
 | 'DISCONNECTED'
/** Credentials were rejected or the account could not be loaded. */
 | 'AUTH_ERROR'
/** `symbol_error`: the symbol could not be resolved. */
 | 'SYMBOL_ERROR'
/** `series_error`: the series could not be loaded (permissions, timeframe...). */
 | 'SERIES_ERROR'
/** `critical_error`: the server rejected a chart or replay command. */
 | 'CRITICAL_ERROR'
/** `study_error`: an indicator failed on the server. */
 | 'STUDY_ERROR'
/** A quote symbol returned an error status. */
 | 'QUOTE_ERROR'
/** A strategy report or compressed payload could not be decoded. */
 | 'PARSE_ERROR'
/** A method was called in a state where it cannot work. */
 | 'INVALID_STATE'
/** An argument is invalid. */
 | 'INVALID_ARGUMENT'
/** An HTTP endpoint answered with an unexpected status or payload. */
 | 'HTTP_ERROR'
/** The requested resource does not exist or is not accessible. */
 | 'NOT_FOUND'
/** The server answered but returned no usable data. */
 | 'NO_DATA'
/** An operation did not complete in time. */
 | 'TIMEOUT'
/** An operation was cancelled through an `AbortSignal`. */
 | 'ABORTED'
/** A user-supplied callback threw while processing data. */
 | 'CALLBACK_ERROR'
/** A backtest signal used bars after the bar it was decided on. */
 | 'LOOK_AHEAD';
export interface TradingViewErrorOptions {
    /** Raw details sent by the server, when available. */
    details?: unknown;
    cause?: unknown;
}
/** Every error produced by this library is a `TradingViewError`. */
export declare class TradingViewError extends Error {
    readonly name = "TradingViewError";
    readonly code: TradingViewErrorCode;
    /** Raw details sent by the server, when available. */
    readonly details: unknown;
    constructor(code: TradingViewErrorCode, message: string, options?: TradingViewErrorOptions);
}
/** Normalises any thrown value into a `TradingViewError`. */
export declare function toTradingViewError(error: unknown, fallbackCode?: TradingViewErrorCode): TradingViewError;
