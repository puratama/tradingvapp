import { runOperation, validateSymbol } from './operation.js';
/** Resolves a symbol: exchange, currency, session, price scale, type... */
export function getSymbolInfo(query) {
    const options = typeof query === 'string' ? { symbol: query } : query;
    let symbol;
    try {
        symbol = validateSymbol(options.symbol);
    }
    catch (error) {
        return Promise.reject(error);
    }
    return runOperation(options, `getSymbolInfo(${symbol})`, ({ client, resolve, reject }) => {
        const chart = client.createChart();
        chart.on('error', reject);
        chart.on('symbolLoaded', resolve);
        chart.setMarket(symbol, { count: 1, session: options.session, currency: options.currency });
        return () => chart.delete();
    });
}
