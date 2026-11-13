import { TradingViewError } from '../errors.js';
import { request } from './request.js';
/** One scanner page. This does not subscribe to live prices or grant exchange entitlements. */
export async function getScreener(query, options = {}) {
    const market = query.market ?? 'global';
    const range = query.range ?? [0, 50];
    if (!/^[a-z][a-z0-9_-]*$/i.test(market)
        || !Array.isArray(query.columns) || !query.columns.length
        || query.columns.some((column) => typeof column !== 'string' || !column.trim())
        || new Set(query.columns).size !== query.columns.length
        || range.length !== 2 || !range.every(Number.isSafeInteger) || range[0] < 0 || range[1] <= range[0]) {
        throw new TradingViewError('INVALID_ARGUMENT', 'Invalid screener market, columns or page range');
    }
    const { data, status } = await request(`https://scanner.tradingview.com/${market}/scan`, {
        method: 'POST',
        credentials: options.credentials,
        headers: { origin: 'https://www.tradingview.com' },
        json: {
            columns: query.columns, range, filter: query.filter ?? [], sort: query.sort,
            symbols: query.symbols === undefined ? undefined : { tickers: query.symbols },
        },
    }, options);
    if (status < 200 || status >= 300 || !data || !Number.isSafeInteger(data.totalCount)
        || data.totalCount < 0 || !Array.isArray(data.data)
        || data.data.some((row) => !row || typeof row.s !== 'string'
            || !Array.isArray(row.d) || row.d.length !== query.columns.length)) {
        throw new TradingViewError('HTTP_ERROR', `Unexpected screener response (HTTP ${status})`);
    }
    return {
        totalCount: data.totalCount,
        rows: data.data.map((row) => ({
            symbol: row.s,
            values: Object.fromEntries(query.columns.map((column, index) => [column, row.d[index]])),
        })),
    };
}
