import { TradingViewClient, type ClientOptions } from '../client/client.js';
import { TradingViewError } from '../errors.js';
import type { Credentials } from '../http/request.js';
/** How high-level functions connect to TradingView. */
export interface ConnectionOptions {
    /**
     * Reuse an existing connection. It is left open afterwards; only the
     * sessions created by the call are removed. Without it, each call opens and
     * closes its own connection.
     */
    client?: TradingViewClient;
    /** Account cookies, for data your account can access. Ignored with `client`. */
    credentials?: Credentials;
    /** Other options for the connection opened by the call. Ignored with `client`. */
    clientOptions?: Omit<ClientOptions, 'credentials'>;
}
export interface OperationOptions extends ConnectionOptions {
    /**
     * Maximum wait in milliseconds. One-shot functions: for the whole call.
     * Watchers: until the first data. Default: 15 000.
     */
    timeoutMs?: number;
    /** Cancels the call (and stops a watcher). */
    signal?: AbortSignal;
}
export declare const DEFAULT_TIMEOUT_MS = 15000;
export declare function validateTimeout(timeoutMs: number | undefined): number;
export declare function validateSymbol(symbol: unknown): string;
export declare function throwIfAborted(signal?: AbortSignal): void;
export interface OperationContext<T> {
    client: TradingViewClient;
    resolve(value: T): void;
    reject(error: unknown): void;
}
type Cleanup = (() => void) | void;
/**
 * Runs a one-shot operation with timeout, abort and guaranteed cleanup:
 * sessions are removed and an owned connection is closed before settling.
 */
export declare function runOperation<T>(options: OperationOptions, description: string, start: (context: OperationContext<T>) => Cleanup): Promise<T>;
/** A running watcher. */
export interface Watcher {
    /** Stops the watcher and releases its sessions/connection. Idempotent. */
    stop(): Promise<void>;
    /** Resolves when the watcher has stopped (after `stop()`, abort or a fatal error). */
    readonly closed: Promise<void>;
    /** True until the watcher stops. */
    readonly isActive: boolean;
}
export interface WatchHandlers {
    /** Errors after start-up. Fatal errors also stop the watcher. */
    onError?(error: TradingViewError): void;
}
export interface WatchContext {
    client: TradingViewClient;
    /** Marks the watcher as started (resolves the start promise). */
    ready(): void;
    /** Before start-up: rejects. After: reports to `onError` and stops. */
    fail(error: unknown): void;
    /** Reports a non-fatal error to `onError`. */
    warn(error: unknown): void;
    isActive(): boolean;
}
/**
 * Starts a watcher. The returned promise resolves once `ready()` is called
 * and rejects on timeout, abort or failure before that.
 */
export declare function startWatcher<W extends Watcher>(options: OperationOptions, description: string, handlers: WatchHandlers, start: (context: WatchContext) => Cleanup, build: (base: Watcher) => W): Promise<W>;
/** Converts a Date or Unix time (seconds) into Unix seconds. */
export declare function toUnixSeconds(value: number | Date | undefined, name: string): number | undefined;
export {};
