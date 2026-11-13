import { timeframeSeconds } from '../chart/timeframes.js';
import { TradingViewError } from '../errors.js';
import { toUnixSeconds, validateSymbol } from './operation.js';
const MAX_CHUNK = 5_000;
function positiveInteger(value, name, fallback) {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < 1) {
        throw new TradingViewError('INVALID_ARGUMENT', `${name} must be a positive integer`);
    }
    return result;
}
/** Validates a query and computes how many bars to request first. */
export function planHistory(query) {
    const symbol = validateSymbol(query.symbol);
    const count = positiveInteger(query.count, 'count', 100);
    const maxCount = positiveInteger(query.maxCount, 'maxCount', 20_000);
    const from = toUnixSeconds(query.from, 'from');
    const to = toUnixSeconds(query.to, 'to');
    if (from !== undefined && to !== undefined && from > to) {
        throw new TradingViewError('INVALID_ARGUMENT', 'from must be before to');
    }
    const timeframe = query.timeframe ?? 'D';
    let initial = Math.min(count, MAX_CHUNK);
    if (from !== undefined) {
        const step = timeframeSeconds(timeframe);
        const end = to ?? Math.floor(Date.now() / 1000);
        initial = step ? Math.ceil((end - from) / step) + 2 : 1_000;
        initial = Math.max(1, Math.min(initial, maxCount, MAX_CHUNK));
    }
    return {
        symbol,
        count,
        from,
        to,
        maxCount,
        timezone: query.timezone,
        market: {
            timeframe,
            count: initial,
            to,
            type: query.chartType,
            inputs: query.chartInputs,
            currency: query.currency,
            session: query.session,
            adjustment: query.adjustment,
            backAdjustment: query.backAdjustment,
        },
    };
}
/** Selects the requested bars from everything loaded on a chart. */
export function selectCandles(candles, plan) {
    let result = candles;
    if (plan.to !== undefined)
        result = result.filter((candle) => candle.time <= plan.to);
    if (plan.from !== undefined)
        return result.filter((candle) => candle.time >= plan.from);
    return result.slice(-plan.count);
}
/** Opens the market on a chart according to a plan. */
export function openMarket(chart, plan) {
    if (plan.timezone)
        chart.setTimezone(plan.timezone);
    chart.setMarket(plan.symbol, plan.market);
}
/**
 * Loads history: after each `series_completed`, requests more bars until the
 * plan is satisfied or the server has no more data. `onDone` receives the
 * last completion info.
 */
export function loadHistory(chart, plan, deep, onDone) {
    let previousSize = -1;
    let done = false;
    return chart.on('seriesCompleted', (info) => {
        if (done)
            return;
        const candles = chart.candles;
        const inRange = plan.to === undefined ? candles : candles.filter((c) => c.time <= plan.to);
        const target = plan.from !== undefined ? plan.maxCount : plan.count;
        const satisfied = plan.from !== undefined
            ? (inRange[0] !== undefined && inRange[0].time <= plan.from)
            : inRange.length >= plan.count;
        const exhausted = info.dataCompleted !== undefined || candles.length <= previousSize;
        if (!deep || satisfied || exhausted || candles.length >= target) {
            done = true;
            onDone(info);
            return;
        }
        previousSize = candles.length;
        const missing = plan.from !== undefined ? MAX_CHUNK : plan.count - inRange.length;
        chart.fetchMore(Math.max(1, Math.min(missing, MAX_CHUNK, target - candles.length)));
    });
}
/** Error for an empty result, with the server's reason when known. */
export function noDataError(symbol, info) {
    const reason = info?.dataCompleted === 'limit'
        ? ' (the server reported an access limit: this range or timeframe may need an account with access)'
        : '';
    return new TradingViewError('NO_DATA', `No candles available for ${symbol} in the requested range${reason}`, {
        details: info?.raw,
    });
}
