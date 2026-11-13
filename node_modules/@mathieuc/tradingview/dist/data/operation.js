import { TradingViewClient } from '../client/client.js';
import { TradingViewError, toTradingViewError } from '../errors.js';
export const DEFAULT_TIMEOUT_MS = 15_000;
function abortError(signal) {
    const { reason } = signal;
    const message = reason instanceof Error ? reason.message : reason ? String(reason) : 'Aborted';
    return new TradingViewError('ABORTED', message, { cause: reason });
}
export function validateTimeout(timeoutMs) {
    const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(value) || value <= 0) {
        throw new TradingViewError('INVALID_ARGUMENT', 'timeoutMs must be a positive number');
    }
    return value;
}
export function validateSymbol(symbol) {
    if (typeof symbol !== 'string' || !symbol.trim()) {
        throw new TradingViewError('INVALID_ARGUMENT', 'symbol is required');
    }
    return symbol.trim();
}
export function throwIfAborted(signal) {
    if (signal?.aborted)
        throw abortError(signal);
}
function connect(options) {
    if (options.client) {
        if (options.client.isClosed)
            throw new TradingViewError('INVALID_STATE', 'The provided client is closed');
        return { client: options.client, release: async () => { } };
    }
    const client = new TradingViewClient({ ...options.clientOptions, credentials: options.credentials });
    return { client, release: () => client.close() };
}
/**
 * Runs a one-shot operation with timeout, abort and guaranteed cleanup:
 * sessions are removed and an owned connection is closed before settling.
 */
export function runOperation(options, description, start) {
    let timeoutMs;
    let connection;
    try {
        timeoutMs = validateTimeout(options.timeoutMs);
        throwIfAborted(options.signal);
        connection = connect(options);
    }
    catch (error) {
        return Promise.reject(toTradingViewError(error, 'INVALID_ARGUMENT'));
    }
    const { client } = connection;
    const { signal } = options;
    return new Promise((resolve, reject) => {
        let settled = false;
        let cleanup;
        const unsubscribers = [];
        let finishStart;
        const startFinished = new Promise((resolve) => { finishStart = resolve; });
        const finish = (error, value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            for (const off of unsubscribers)
                off();
            // `start` may resolve synchronously, before it has returned its cleanup.
            startFinished.then(() => {
                try {
                    cleanup?.();
                }
                catch {
                    // Cleanup must never hide the result.
                }
                return connection.release().catch(() => { });
            }).then(() => {
                if (error)
                    reject(error);
                else
                    resolve(value);
            });
        };
        const onAbort = () => finish(abortError(signal));
        const timer = setTimeout(() => {
            finish(new TradingViewError('TIMEOUT', `${description} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        signal?.addEventListener('abort', onAbort, { once: true });
        unsubscribers.push(client.on('error', (error) => finish(error)), client.on('close', () => finish(new TradingViewError('DISCONNECTED', `Connection closed during ${description}`))));
        try {
            cleanup = start({
                client,
                resolve: (value) => finish(undefined, value),
                reject: (error) => finish(toTradingViewError(error)),
            });
        }
        catch (error) {
            finish(toTradingViewError(error, 'INVALID_ARGUMENT'));
        }
        finally {
            finishStart();
        }
    });
}
/**
 * Starts a watcher. The returned promise resolves once `ready()` is called
 * and rejects on timeout, abort or failure before that.
 */
export function startWatcher(options, description, handlers, start, build) {
    let timeoutMs;
    let connection;
    try {
        timeoutMs = validateTimeout(options.timeoutMs);
        throwIfAborted(options.signal);
        connection = connect(options);
    }
    catch (error) {
        return Promise.reject(toTradingViewError(error, 'INVALID_ARGUMENT'));
    }
    const { client } = connection;
    const { signal } = options;
    let active = true;
    let started = false;
    let cleanup;
    let finishStart;
    const startFinished = new Promise((resolve) => { finishStart = resolve; });
    let stopPromise;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const unsubscribers = [];
    let resolveStart;
    let rejectStart;
    const startPromise = new Promise((resolve, reject) => {
        resolveStart = resolve;
        rejectStart = reject;
    });
    const report = (error) => {
        try {
            handlers.onError?.(error);
        }
        catch (listenerError) {
            console.error('[tradingview] onError callback threw:', listenerError);
        }
    };
    const stop = () => {
        if (stopPromise)
            return stopPromise;
        active = false;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        for (const off of unsubscribers)
            off();
        // A synchronous ready/fail can stop before `start` returns its cleanup.
        stopPromise = startFinished.then(() => {
            try {
                cleanup?.();
            }
            catch {
                // Ignore cleanup failures.
            }
            return connection.release().catch(() => { });
        }).then(() => resolveClosed());
        return stopPromise;
    };
    const fail = (raw) => {
        if (!active)
            return;
        const error = toTradingViewError(raw);
        const closing = stop();
        if (!started)
            closing.then(() => rejectStart(error));
        else
            report(error);
    };
    const watcher = build({
        stop,
        closed,
        get isActive() {
            return active;
        },
    });
    const onAbort = () => fail(abortError(signal));
    const timer = setTimeout(() => {
        if (!started)
            fail(new TradingViewError('TIMEOUT', `${description} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    unsubscribers.push(client.on('error', (error) => fail(error)), client.on('close', () => fail(new TradingViewError('DISCONNECTED', `Connection closed during ${description}`))));
    try {
        cleanup = start({
            client,
            ready: () => {
                if (!active || started)
                    return;
                started = true;
                clearTimeout(timer);
                resolveStart(watcher);
            },
            fail,
            warn: (error) => {
                if (active)
                    report(toTradingViewError(error));
            },
            isActive: () => active,
        });
    }
    catch (error) {
        fail(error);
    }
    finally {
        finishStart();
    }
    return startPromise;
}
/** Converts a Date or Unix time (seconds) into Unix seconds. */
export function toUnixSeconds(value, name) {
    if (value === undefined)
        return undefined;
    const seconds = value instanceof Date ? Math.floor(value.getTime() / 1000) : value;
    if (!Number.isFinite(seconds))
        throw new TradingViewError('INVALID_ARGUMENT', `${name} must be a Date or Unix seconds`);
    return seconds;
}
