type EventMap = {
    [event: string]: unknown[];
};
export type Listener<Args extends unknown[]> = (...args: Args) => void;
/** Unsubscribes the listener it was returned for. */
export type Unsubscribe = () => void;
/** Catch-all listener: receives the event name, then the event arguments. */
export type AnyListener<Events extends EventMap> = (...args: {
    [K in keyof Events & string]: [event: K, ...args: Events[K]];
}[keyof Events & string]) => void;
/**
 * Small typed event emitter shared by clients, sessions and studies.
 *
 * Listener exceptions are reported without interrupting other listeners or
 * crashing the host process. An `error` event without any
 * listener is written to `console.error` instead of being silently dropped.
 */
export declare class Emitter<Events extends EventMap> {
    #private;
    /** Adds a listener and returns a function that removes it. */
    on<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): Unsubscribe;
    /** Adds a listener called at most once. */
    once<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): Unsubscribe;
    /** Removes a listener. */
    off<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): void;
    /** Listens to every event; receives the event name first. */
    onAny(listener: AnyListener<Events>): Unsubscribe;
    /** Number of listeners for an event (catch-all listeners excluded). */
    listenerCount(event: keyof Events & string): number;
    /** True when the event has a listener, including catch-all listeners. */
    protected hasListeners(event: keyof Events & string): boolean;
    /** Removes every listener. */
    protected removeAllListeners(): void;
    protected emit<K extends keyof Events & string>(event: K, ...args: Events[K]): void;
}
export {};
