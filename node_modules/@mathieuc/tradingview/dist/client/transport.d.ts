/** Callbacks a transport must call. */
export interface TransportHandlers {
    onOpen(): void;
    onMessage(data: string): void;
    onClose(code?: number, reason?: string): void;
    onError(error: Error): void;
}
/** Minimal websocket abstraction used by `TradingViewClient`. */
export interface Transport {
    /** True when the connection is open and can send. */
    readonly isOpen: boolean;
    send(data: string): void;
    /** Starts a graceful close. `onClose` must be called once closed. */
    close(): void;
    /** Destroys the connection without a closing handshake (unresponsive peer). */
    terminate?(): void;
}
export interface TransportRequest {
    url: string;
    origin: string;
    headers: Record<string, string>;
}
/**
 * Creates a transport. The default uses the `ws` package (Node and Bun).
 * Provide your own to use another websocket library or a test double; see
 * `createProxy` for proxies.
 */
export type TransportFactory = (request: TransportRequest, handlers: TransportHandlers) => Transport;
/** A Node `http.Agent` (typed structurally so declarations do not need `@types/node`). */
export interface HttpAgentLike {
    destroy(): void;
}
export interface WsTransportOptions {
    /** Node `Agent` used for the handshake, e.g. a proxy agent. May depend on the websocket URL. */
    agent?: HttpAgentLike | ((url: string) => HttpAgentLike);
}
/** Creates a transport based on the `ws` package. */
export declare function createWsTransport(options?: WsTransportOptions): TransportFactory;
/** @internal */
export declare function wsTransportWith(extra: (url: string) => Record<string, unknown>): TransportFactory;
/** Default transport based on the `ws` package. */
export declare const wsTransport: TransportFactory;
