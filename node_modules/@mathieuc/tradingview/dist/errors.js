/** Every error produced by this library is a `TradingViewError`. */
export class TradingViewError extends Error {
    name = 'TradingViewError';
    code;
    /** Raw details sent by the server, when available. */
    details;
    constructor(code, message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.code = code;
        this.details = options.details;
    }
}
/** Normalises any thrown value into a `TradingViewError`. */
export function toTradingViewError(error, fallbackCode = 'CONNECTION_ERROR') {
    if (error instanceof TradingViewError)
        return error;
    if (error instanceof Error) {
        if (error.name === 'AbortError') {
            return new TradingViewError('ABORTED', error.message || 'Aborted', { cause: error });
        }
        return new TradingViewError(fallbackCode, error.message, { cause: error });
    }
    return new TradingViewError(fallbackCode, String(error), { details: error });
}
