import { TradingViewError } from '../errors.js';
import { Emitter } from '../events.js';
import { type Credentials } from '../http/request.js';
import { type ServerHello, type ServerPacket } from '../protocol/framing.js';
import { type TransportFactory } from './transport.js';
import { ChartSession } from '../chart/chart-session.js';
import { QuoteSession, type QuoteSessionOptions } from '../quote/quote-session.js';
/** Websocket server. `prodata` is used by paid accounts, `widgetdata` by widgets. */
export type ServerName = 'data' | 'prodata' | 'widgetdata' | (string & {});
export type DebugOption = boolean | ((...args: unknown[]) => void);
export interface ClientOptions {
    /** Account cookies. Without them, the client uses anonymous (delayed/limited) access. */
    credentials?: Credentials;
    /** Websocket auth token (`User.authToken`). Skips the account lookup done with `credentials`. */
    authToken?: string;
    /** Websocket server. Default: `data`. */
    server?: ServerName;
    /** Page used to load the account from `credentials`, e.g. `https://fr.tradingview.com/`. */
    location?: string;
    /** Extra websocket headers. */
    headers?: Record<string, string>;
    /** Logs packets: `true` uses `console.log`, a function receives the log arguments. */
    debug?: DebugOption;
    /** Custom websocket transport (proxies, tests). */
    transport?: TransportFactory;
    /** Custom `fetch` for the account lookup. */
    fetch?: typeof fetch;
    /** Time allowed to open and authenticate the connection. Default: 20 000 ms. */
    connectTimeoutMs?: number;
    /**
     * Maximum silence from the server once connected. The server sends a
     * heartbeat about every 10 seconds, so a longer silence means the network
     * was lost without a close (sleep, NAT or proxy timeout): the client then
     * fails with `CONNECTION_ERROR` and closes. `0` or `Infinity` disables it.
     * Default: 60 000 ms.
     */
    inactivityTimeoutMs?: number;
}
export interface ClientEvents {
    [event: string]: unknown[];
    /** The websocket is open. */
    open: [];
    /** The server greeting was received. */
    hello: [hello: ServerHello];
    /** The auth token was sent; queued packets are now flowing. */
    ready: [];
    /** A server heartbeat was received (the client answers automatically). */
    heartbeat: [id: number];
    /** A packet not addressed to any session of this client. */
    packet: [packet: ServerPacket];
    /** The websocket closed. */
    close: [code?: number, reason?: string];
    error: [error: TradingViewError];
}
/** @internal Implemented by chart, replay and quote sessions. */
export interface SessionHandler {
    onPacket(packet: ServerPacket): void;
    /** `expected` is true when the connection was closed with `client.close()`. */
    onClose?(error: TradingViewError, expected: boolean): void;
}
/**
 * One websocket connection to TradingView. Chart and quote sessions are
 * multiplexed over it.
 *
 * The connection opens immediately; packets are queued until it is open and
 * authenticated. Always call `close()` when you are done.
 */
export declare class TradingViewClient extends Emitter<ClientEvents> {
    #private;
    readonly ready: Promise<void>;
    constructor(options?: ClientOptions);
    /** True while the websocket is open. */
    get isOpen(): boolean;
    /** True once the auth token has been sent. */
    get isAuthenticated(): boolean;
    /** True after `close()` or a disconnection. */
    get isClosed(): boolean;
    /** Server greeting, once received. */
    get serverInfo(): ServerHello | undefined;
    /** Creates a chart session on this connection. */
    createChart(): ChartSession;
    /** Creates a quote session on this connection. */
    createQuoteSession(options?: QuoteSessionOptions): QuoteSession;
    /**
     * Sends a raw packet. Packets are queued until the connection is ready.
     * Prefer session methods; this is an escape hatch for unsupported commands.
     */
    send(method: string, params?: readonly unknown[]): void;
    /** @internal Registers a session to receive its packets. */
    registerSession(id: string, handler: SessionHandler): void;
    /** @internal */
    unregisterSession(id: string): void;
    /** @internal Debug logger shared with sessions. */
    log(...args: unknown[]): void;
    /** Closes the connection. Resolves once the websocket is closed. Idempotent. */
    close(): Promise<void>;
}
