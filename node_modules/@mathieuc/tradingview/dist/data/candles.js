import { TradingViewError } from '../errors.js';
import { loadHistory, noDataError, openMarket, planHistory, selectCandles, } from './history.js';
import { runOperation, startWatcher, } from './operation.js';
/**
 * Fetches candles once, oldest first, then releases every resource.
 *
 * - `{ symbol, timeframe, count }`: the `count` most recent bars (deep history
 *   is loaded automatically when `count` exceeds one server batch).
 * - `{ symbol, timeframe, from, to }`: every bar in the range.
 *
 * @example
 * const candles = await getCandles({ symbol: 'BINANCE:BTCUSDT', timeframe: '60', count: 500 });
 */
export function getCandles(query, provider) {
    const options = typeof query === 'string' ? { symbol: query } : query;
    let plan;
    try {
        plan = planHistory(options);
    }
    catch (error) {
        return Promise.reject(error);
    }
    if (provider) {
        return (async () => {
            let snapshot = [];
            const worker = await provider.watchCandles(options, {
                onData: (candles) => { snapshot = candles; },
            });
            try {
                return [...(snapshot.length ? snapshot : worker.latest)];
            }
            finally {
                await worker.stop();
            }
        })();
    }
    return runOperation(options, `getCandles(${plan.symbol})`, ({ client, resolve, reject }) => {
        const chart = client.createChart();
        chart.on('error', reject);
        loadHistory(chart, plan, true, (info) => {
            const candles = selectCandles(chart.candles, plan);
            if (candles.length === 0)
                reject(noDataError(plan.symbol, info));
            else
                resolve(candles);
        });
        openMarket(chart, plan);
        return () => chart.delete();
    });
}
export function watchCandles(query, handlers, provider) {
    let plan;
    try {
        if (typeof handlers?.onData !== 'function')
            throw new TradingViewError('INVALID_ARGUMENT', 'onData must be a function');
        plan = planHistory({ ...query, from: undefined, to: undefined });
    }
    catch (error) {
        return Promise.reject(error);
    }
    if (provider)
        return provider.watchCandles(query, handlers);
    let latest = Object.freeze([]);
    let symbolInfo;
    return startWatcher(query, `watchCandles(${plan.symbol})`, handlers, (ctx) => {
        const chart = ctx.client.createChart();
        let started = false;
        const publish = () => {
            latest = Object.freeze(selectCandles(chart.candles, plan).map((candle) => Object.freeze({ ...candle })));
            try {
                handlers.onData(latest);
            }
            catch (error) {
                ctx.warn(new TradingViewError('CALLBACK_ERROR', 'onData callback threw', { cause: error }));
            }
        };
        chart.on('error', (error) => ctx.fail(error));
        chart.on('symbolLoaded', (info) => { symbolInfo = info; });
        chart.on('update', (changes) => {
            if (started && ctx.isActive() && changes.includes('$prices'))
                publish();
        });
        loadHistory(chart, plan, false, (info) => {
            if (chart.candles.length === 0) {
                ctx.fail(noDataError(plan.symbol, info));
                return;
            }
            started = true;
            publish();
            ctx.ready();
        });
        openMarket(chart, plan);
        return () => chart.delete();
    }, (base) => ({
        stop: base.stop,
        closed: base.closed,
        get isActive() { return base.isActive; },
        get latest() { return latest; },
        get symbolInfo() { return symbolInfo; },
    }));
}
