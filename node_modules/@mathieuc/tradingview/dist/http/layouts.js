import { TradingViewError } from '../errors.js';
import { request } from './request.js';
/** Gets a chart-storage token for a layout (the ID in `tradingview.com/chart/<ID>/`). */
export async function getChartToken(layoutId, options = {}) {
    const authenticated = Boolean(options.credentials?.session && options.userId);
    const { data } = await request('https://www.tradingview.com/chart-token', {
        query: { image_url: layoutId, user_id: authenticated ? options.userId : -1 },
        credentials: authenticated ? options.credentials : undefined,
    }, options);
    if (!data?.token)
        throw new TradingViewError('NOT_FOUND', 'Wrong layout or credentials', { details: data });
    return data.token;
}
/** Lists the drawings of a layout. */
export async function getDrawings(layoutId, options = {}) {
    const token = await getChartToken(layoutId, options);
    const { data } = await request(`https://charts-storage.tradingview.com/charts-storage/get/layout/${layoutId}/sources`, {
        query: { chart_id: options.chartId ?? '_shared', jwt: token, symbol: options.symbol ?? '' },
    }, options);
    if (!data?.payload) {
        throw new TradingViewError('NOT_FOUND', 'Wrong layout, user credentials, or chart id', { details: data });
    }
    return Object.values(data.payload.sources ?? {}).map((drawing) => ({ ...drawing, ...drawing.state }));
}
