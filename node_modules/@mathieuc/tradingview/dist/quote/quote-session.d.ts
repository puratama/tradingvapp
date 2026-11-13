import type { TradingViewClient } from '../client/client.js';
import { TradingViewError } from '../errors.js';
import { Emitter } from '../events.js';
import type { TradingSession } from '../chart/types.js';
import type { ServerPacket } from '../protocol/framing.js';
import { type QuoteData, type QuoteField, type QuoteFieldPreset } from './fields.js';
export interface QuoteSessionOptions {
    /** `all` (default), `price`, or an explicit list of fields. */
    fields?: QuoteFieldPreset | readonly QuoteField[];
}
export interface QuoteSubscriptionOptions {
    /** Trading session. Default: `regular`. */
    session?: TradingSession;
}
export interface QuoteSubscriptionEvents {
    [event: string]: unknown[];
    /** Initial values were received. */
    loaded: [];
    /** New values. `quote` is the merged snapshot, `changes` only the new fields. */
    data: [quote: QuoteData, changes: QuoteData];
    error: [error: TradingViewError];
}
export interface QuoteSessionEvents {
    [event: string]: unknown[];
    error: [error: TradingViewError];
}
/** Key identifying a symbol + session in quote packets. */
export declare function quoteSymbolKey(symbol: string, session?: TradingSession): string;
/** Live quotes for one symbol. Create it with `quoteSession.subscribe()`. */
export declare class QuoteSubscription extends Emitter<QuoteSubscriptionEvents> {
    #private;
    readonly symbol: string;
    readonly session: TradingSession;
    /** @internal */
    readonly key: string;
    /** @internal Use `quoteSession.subscribe()`. */
    constructor(symbol: string, session: TradingSession, onClose: (subscription: QuoteSubscription) => void);
    /** Latest merged values. */
    get data(): QuoteData;
    /** True after the initial values were received. */
    get isLoaded(): boolean;
    get isClosed(): boolean;
    /** Stops receiving quotes for this subscription. Idempotent. */
    close(): void;
    /** @internal Copies the state of a loaded subscription to the same symbol. */
    seed(source: QuoteSubscription): void;
    /** @internal */
    handlePacket(packet: ServerPacket): void;
    /** @internal */
    handleClose(error: TradingViewError, expected: boolean): void;
}
/**
 * A set of live quote subscriptions sharing the same fields.
 * Create it with `client.createQuoteSession()`.
 */
export declare class QuoteSession extends Emitter<QuoteSessionEvents> {
    #private;
    readonly id: string;
    readonly client: TradingViewClient;
    constructor(client: TradingViewClient, options?: QuoteSessionOptions);
    /** Requested fields. */
    get fields(): readonly QuoteField[];
    get isDeleted(): boolean;
    /** Changes the requested fields for every subscription. */
    setFields(fields: QuoteFieldPreset | readonly QuoteField[]): void;
    /**
     * Subscribes to a symbol. Several subscriptions to the same symbol share
     * one server subscription.
     */
    subscribe(symbol: string, options?: QuoteSubscriptionOptions): QuoteSubscription;
    /** Deletes the session and all its subscriptions. Idempotent. */
    delete(): void;
}
