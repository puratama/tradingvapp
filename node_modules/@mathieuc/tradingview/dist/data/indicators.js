import { TradingViewError, toTradingViewError } from '../errors.js';
import { getIndicator } from '../http/indicators.js';
import { BuiltInIndicator } from '../indicators/builtin-indicator.js';
import { PineIndicator } from '../indicators/pine-indicator.js';
import { loadHistory, noDataError, openMarket, planHistory, selectCandles, } from './history.js';
import { runOperation, startWatcher, throwIfAborted, } from './operation.js';
/** Resolves an indicator ID or instance and applies inputs. */
export async function resolveIndicator(query) {
    const { indicator, inputs } = query;
    let resolved;
    if (indicator instanceof PineIndicator)
        resolved = indicator.clone();
    else if (indicator instanceof BuiltInIndicator)
        resolved = new BuiltInIndicator(indicator.type, indicator.options);
    else if (typeof indicator === 'string' && indicator.trim()) {
        resolved = indicator.includes('@')
            ? new BuiltInIndicator(indicator)
            : await getIndicator(indicator, {
                version: query.version,
                credentials: query.credentials,
                signal: query.signal,
                fetch: query.clientOptions?.fetch,
            });
    }
    else {
        throw new TradingViewError('INVALID_ARGUMENT', 'indicator must be a script ID, a built-in type or an indicator instance');
    }
    for (const [key, value] of Object.entries(inputs ?? {})) {
        if (resolved instanceof PineIndicator)
            resolved.setInput(key, value);
        else
            resolved.setOption(key, value);
    }
    return resolved;
}
function snapshot(chart, study, plan) {
    return {
        indicator: study.indicator,
        candles: selectCandles(chart.candles, plan),
        values: study.values,
        graphics: study.graphics,
        strategyReport: structuredClone(study.strategyReport),
    };
}
/**
 * Runs history loading and the study together; calls `onReady` once both
 * the bars and the study computation are complete.
 */
function trackReadiness(chart, study, plan, deep, onReady, onEmpty) {
    let historyDone = false;
    let studyLoading = true;
    let fired = false;
    const check = () => {
        if (fired || !historyDone || studyLoading)
            return;
        fired = true;
        onReady();
    };
    study.on('loading', () => { studyLoading = true; });
    study.on('ready', () => { studyLoading = false; check(); });
    loadHistory(chart, plan, deep, (info) => {
        if (chart.candles.length === 0) {
            fired = true;
            onEmpty(noDataError(plan.symbol, info));
            return;
        }
        historyDone = true;
        check();
    });
}
function prepare(query) {
    return planHistory({ ...query, from: undefined });
}
/**
 * Runs an indicator or strategy once and returns its values, drawings and
 * strategy report.
 *
 * @example
 * const { values } = await getIndicatorData({ symbol: 'BINANCE:BTCUSDT', indicator: 'STD;RSI' });
 */
export async function getIndicatorData(query) {
    const plan = prepare(query);
    throwIfAborted(query.signal);
    const indicator = await resolveIndicator(query).catch((error) => {
        throw toTradingViewError(error, 'NOT_FOUND');
    });
    return runOperation(query, `getIndicatorData(${plan.symbol})`, ({ client, resolve, reject }) => {
        const chart = client.createChart();
        chart.on('error', reject);
        openMarket(chart, plan);
        const study = chart.createStudy(indicator);
        study.on('error', reject);
        trackReadiness(chart, study, plan, true, () => resolve(snapshot(chart, study, plan)), reject);
        return () => chart.delete();
    });
}
/** Streams an indicator in real time. Call `stop()` when finished. */
export async function watchIndicator(query, handlers) {
    if (typeof handlers?.onData !== 'function')
        throw new TradingViewError('INVALID_ARGUMENT', 'onData must be a function');
    const plan = prepare({ ...query, to: undefined });
    throwIfAborted(query.signal);
    const indicator = await resolveIndicator(query).catch((error) => {
        throw toTradingViewError(error, 'NOT_FOUND');
    });
    let latest;
    return startWatcher(query, `watchIndicator(${plan.symbol})`, handlers, (ctx) => {
        const chart = ctx.client.createChart();
        let started = false;
        const publish = () => {
            latest = snapshot(chart, study, plan);
            try {
                handlers.onData(latest);
            }
            catch (error) {
                ctx.warn(new TradingViewError('CALLBACK_ERROR', 'onData callback threw', { cause: error }));
            }
        };
        chart.on('error', (error) => ctx.fail(error));
        openMarket(chart, plan);
        const study = chart.createStudy(indicator);
        study.on('error', (error) => ctx.fail(error));
        study.on('update', () => {
            if (started && ctx.isActive())
                publish();
        });
        trackReadiness(chart, study, plan, false, () => {
            started = true;
            publish();
            ctx.ready();
        }, (error) => ctx.fail(error));
        return () => chart.delete();
    }, (base) => ({
        stop: base.stop,
        closed: base.closed,
        get isActive() { return base.isActive; },
        get latest() { return latest; },
    }));
}
