import { TradingViewError } from '../errors.js';
import { request } from './request.js';
const ORIGIN = { origin: 'https://www.tradingview.com' };
/** Searches markets by keywords, `EXCHANGE:` prefix or `EXCHANGE:SYMBOL`. */
export async function searchMarkets(query, options = {}) {
    const parts = query.toUpperCase().split(':');
    const text = parts.length === 2 ? parts[1] : query.toUpperCase();
    const exchange = options.exchange ?? (parts.length === 2 ? parts[0] : undefined);
    const { data, status } = await request('https://symbol-search.tradingview.com/symbol_search/v3/', {
        query: {
            text, exchange, search_type: options.type ?? '', start: options.offset ?? 0,
            country: options.country, sector: options.sector,
        },
        headers: ORIGIN,
    }, options);
    if (!data || !Array.isArray(data.symbols)) {
        throw new TradingViewError('HTTP_ERROR', `Unexpected market search response (HTTP ${status})`, { details: data });
    }
    return data.symbols.map((s) => {
        const shortExchange = String(s.exchange ?? '').split(' ')[0];
        const symbol = String(s.symbol ?? '').replace(/<\/?em>/g, '');
        return {
            id: s.prefix ? `${s.prefix}:${symbol}` : `${shortExchange.toUpperCase()}:${symbol}`,
            exchange: shortExchange,
            fullExchange: s.exchange,
            symbol,
            description: String(s.description ?? '').replace(/<\/?em>/g, ''),
            type: s.type,
            currency: s.currency_code,
            country: s.country,
        };
    });
}
const TA_PERIODS = ['1', '5', '15', '60', '240', '1D', '1W', '1M'];
const TA_INDICATORS = ['Recommend.Other', 'Recommend.All', 'Recommend.MA'];
/**
 * Gets technical ratings for every period from the TradingView scanner.
 * Returns `null` when the scanner has no data for the symbol.
 *
 * Values are scaled like the historical API: `round(raw * 1000) / 500`,
 * which maps the scanner range [-1, 1] to [-2, 2].
 */
export async function getTechnicalAnalysis(symbol, options = {}) {
    const columns = TA_PERIODS.flatMap((period) => TA_INDICATORS.map((name) => (period === '1D' ? name : `${name}|${period}`)));
    const { data } = await request('https://scanner.tradingview.com/global/scan', {
        method: 'POST',
        json: { symbols: { tickers: [symbol] }, columns },
    }, options);
    const values = data?.data?.[0]?.d;
    if (!values)
        return null;
    const result = {};
    values.forEach((value, index) => {
        const [name, period = '1D'] = columns[index].split('|');
        const key = name.split('.').pop();
        result[period] ??= {};
        result[period][key] = Math.round(Number(value) * 1000) / 500;
    });
    return result;
}
