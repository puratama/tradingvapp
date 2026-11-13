import { TradingViewError } from '../errors.js';
/** Converts raw trades (oldest first) into readable trades (most recent first). */
export function parseTrades(trades) {
    if (!Array.isArray(trades) || trades.some((trade) => !trade || typeof trade !== 'object' || Array.isArray(trade))) {
        throw new TradingViewError('PARSE_ERROR', 'Strategy trades must be an array of records');
    }
    return [...trades].reverse().map((t) => ({
        entry: {
            name: t.e?.c,
            type: String(t.e?.tp ?? '').startsWith('s') ? 'short' : 'long',
            value: t.e?.p,
            time: t.e?.tm,
        },
        exit: { name: t.x?.c, value: t.x?.p, time: t.x?.tm },
        quantity: t.q,
        profit: t.tp,
        cumulative: t.cp,
        runup: t.rn,
        drawdown: t.dd,
    }));
}
/** Merges a raw report into `target`; returns the changed parts. */
export function mergeStrategyReport(target, report) {
    const changes = [];
    if (!report || typeof report !== 'object')
        return changes;
    // Parse before mutating the target so a malformed trade list cannot leave a partial merge.
    const trades = report.trades === undefined ? undefined : parseTrades(report.trades);
    if (report.currency) {
        target.currency = report.currency;
        changes.push('report.currency');
    }
    if (report.settings) {
        target.settings = report.settings;
        changes.push('report.settings');
    }
    if (report.performance) {
        target.performance = report.performance;
        changes.push('report.perf');
    }
    if (trades !== undefined) {
        target.trades = trades;
        changes.push('report.trades');
    }
    const historyKeys = [
        'buyHold', 'buyHoldPercent', 'drawDown', 'drawDownPercent', 'equity', 'equityPercent',
    ];
    let historyChanged = false;
    for (const key of historyKeys) {
        if (Array.isArray(report[key])) {
            target.history[key] = report[key];
            historyChanged = true;
        }
    }
    if (historyChanged)
        changes.push('report.history');
    return changes;
}
/** Summarizes reported aggregates without inferring missing values or trade status. */
export function summarizeStrategyReport(report) {
    const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const count = (value) => {
        const n = finite(value);
        return n !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined;
    };
    const closedNetProfit = finite(report.performance.all?.netProfit);
    const openPnL = finite(report.performance.openPL);
    return {
        currency: report.currency,
        tradeRecordCount: report.trades.length,
        closedTradeCount: count(report.performance.all?.totalTrades),
        openTradeCount: count(report.performance.all?.totalOpenTrades),
        closedNetProfit,
        openPnL,
        totalPnL: closedNetProfit !== undefined && openPnL !== undefined
            ? finite(closedNetProfit + openPnL) : undefined,
    };
}
