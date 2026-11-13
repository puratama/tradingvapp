import { watchCandles } from './candles.js';
/** Default candle source backed by TradingView, with optional connection defaults. */
export class TradingViewProvider {
    connection;
    constructor(connection = {}) {
        this.connection = connection;
    }
    watchCandles(query, handlers) {
        return watchCandles({ ...this.connection, ...query }, handlers);
    }
}
