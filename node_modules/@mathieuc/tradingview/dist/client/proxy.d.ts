import { type HttpAgentLike, type TransportFactory } from './transport.js';
/** Subset of Node `tls.ConnectionOptions`; other Node TLS options are passed through. */
export interface ProxyTlsOptions {
    /** Extra trusted certificate authorities (PEM). */
    ca?: string | Uint8Array | Array<string | Uint8Array>;
    rejectUnauthorized?: boolean;
    [option: string]: unknown;
}
export interface ProxyOptions {
    /**
     * TLS options for TradingView connections made through the tunnel, and for
     * the proxy itself when it uses `https:`. Use `ca` to trust an inspecting
     * corporate proxy.
     */
    tls?: ProxyTlsOptions;
    /** Time allowed for the proxy to open a tunnel. Default: 20 000 ms. */
    connectTimeoutMs?: number;
}
/** `fetch` and websocket transport that both go through the same proxy. */
export interface ProxyAdapter {
    /** Pass as the `fetch` option of HTTP functions, the client or the data API. */
    fetch: typeof fetch;
    /** Pass as the `transport` option of the client or the data API `clientOptions`. */
    transport: TransportFactory;
}
/**
 * Routes HTTP requests and websockets through a proxy. Pass the result where a
 * `fetch` or `transport` is accepted:
 *
 * ```ts
 * const proxy = createProxy('http://user:password@proxy.local:3128');
 * const client = new TradingViewClient({ ...proxy, credentials });
 * await getCandles({ symbol: 'BINANCE:BTCUSDT', clientOptions: proxy });
 * await searchMarkets('BTC', { fetch: proxy.fetch });
 * ```
 *
 * A URL creates a built-in HTTP CONNECT tunnel (`http:` or `https:` proxy,
 * optional basic auth from the URL). On Node, any other `Agent` (for example
 * from `socks-proxy-agent`) is used as-is for both paths. On Bun (1.3.6+),
 * the URL is passed to Bun's native `proxy` support.
 */
export declare function createProxy(proxy: string | URL | HttpAgentLike, options?: ProxyOptions): ProxyAdapter;
