import { TradingViewError } from '../errors.js';
import { runOperation, startWatcher, validateSymbol, } from './operation.js';
function validateSymbols(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
        throw new TradingViewError('INVALID_ARGUMENT', 'symbols must be a non-empty array');
    }
    return [...new Set(symbols.map(validateSymbol))];
}
/** Gets quotes for several symbols at once, keyed by symbol. */
export function getQuotes(query) {
    const options = Array.isArray(query) ? { symbols: query } : query;
    let symbols;
    try {
        symbols = validateSymbols(options.symbols);
    }
    catch (error) {
        return Promise.reject(error);
    }
    return runOperation(options, `getQuotes(${symbols.join(', ')})`, ({ client, resolve, reject }) => {
        const session = client.createQuoteSession({ fields: options.fields });
        const results = {};
        let pending = symbols.length;
        for (const symbol of symbols) {
            const sub = session.subscribe(symbol, { session: options.session });
            sub.on('error', reject);
            sub.once('loaded', () => {
                results[symbol] = sub.data;
                pending -= 1;
                if (pending === 0)
                    resolve(results);
            });
        }
        return () => session.delete();
    });
}
/** Gets the current quote of a symbol (last price, change, volume...). */
export async function getQuote(query) {
    const options = typeof query === 'string' ? { symbol: query } : query;
    const symbol = validateSymbol(options.symbol);
    const quotes = await getQuotes({ ...options, symbols: [symbol] });
    return quotes[symbol];
}
/**
 * Streams quotes for one or more symbols. Resolves once every symbol has
 * loaded (or failed: failures go to `onError`; if every symbol fails, the
 * promise rejects). Call `stop()` when finished.
 */
export function watchQuotes(query, handlers) {
    let symbols;
    try {
        if (typeof handlers?.onData !== 'function')
            throw new TradingViewError('INVALID_ARGUMENT', 'onData must be a function');
        symbols = validateSymbols(query.symbols);
    }
    catch (error) {
        return Promise.reject(error);
    }
    const latest = {};
    return startWatcher(query, `watchQuotes(${symbols.join(', ')})`, handlers, (ctx) => {
        const session = ctx.client.createQuoteSession({ fields: query.fields });
        const settled = new Set();
        const errors = [];
        let loaded = 0;
        const settle = (symbol, ok) => {
            if (settled.has(symbol))
                return;
            settled.add(symbol);
            if (ok)
                loaded += 1;
            if (settled.size < symbols.length)
                return;
            if (loaded === 0)
                ctx.fail(errors[0]);
            else {
                for (const error of errors)
                    ctx.warn(error);
                ctx.ready();
            }
        };
        const subscriptions = symbols.map((symbol) => {
            const sub = session.subscribe(symbol, { session: query.session });
            sub.on('data', (quote, changes) => {
                latest[symbol] = quote;
                if (!ctx.isActive())
                    return;
                try {
                    handlers.onData(symbol, quote, changes);
                }
                catch (error) {
                    ctx.warn(new TradingViewError('CALLBACK_ERROR', 'onData callback threw', { cause: error }));
                }
            });
            sub.on('loaded', () => settle(symbol, true));
            sub.on('error', (error) => {
                if (error.code === 'DISCONNECTED')
                    return; // Reported by the watcher itself.
                if (settled.size < symbols.length && !settled.has(symbol)) {
                    errors.push(error);
                    settle(symbol, false);
                }
                else
                    ctx.warn(error);
            });
            return sub;
        });
        return () => {
            for (const sub of subscriptions)
                sub.close();
            session.delete();
        };
    }, (base) => ({
        stop: base.stop,
        closed: base.closed,
        get isActive() { return base.isActive; },
        get latest() { return { ...latest }; },
    }));
}
