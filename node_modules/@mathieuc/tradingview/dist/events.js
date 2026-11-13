/**
 * Small typed event emitter shared by clients, sessions and studies.
 *
 * Listener exceptions are reported without interrupting other listeners or
 * crashing the host process. An `error` event without any
 * listener is written to `console.error` instead of being silently dropped.
 */
export class Emitter {
    #listeners = new Map();
    #anyListeners = new Set();
    /** Adds a listener and returns a function that removes it. */
    on(event, listener) {
        let set = this.#listeners.get(event);
        if (!set) {
            set = new Set();
            this.#listeners.set(event, set);
        }
        set.add(listener);
        return () => this.off(event, listener);
    }
    /** Adds a listener called at most once. */
    once(event, listener) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            return listener(...args);
        };
        return this.on(event, wrapper);
    }
    /** Removes a listener. */
    off(event, listener) {
        this.#listeners.get(event)?.delete(listener);
    }
    /** Listens to every event; receives the event name first. */
    onAny(listener) {
        this.#anyListeners.add(listener);
        return () => { this.#anyListeners.delete(listener); };
    }
    /** Number of listeners for an event (catch-all listeners excluded). */
    listenerCount(event) {
        return this.#listeners.get(event)?.size ?? 0;
    }
    /** True when the event has a listener, including catch-all listeners. */
    hasListeners(event) {
        return this.listenerCount(event) > 0 || this.#anyListeners.size > 0;
    }
    /** Removes every listener. */
    removeAllListeners() {
        this.#listeners.clear();
        this.#anyListeners.clear();
    }
    emit(event, ...args) {
        const set = this.#listeners.get(event);
        if (event === 'error' && !set?.size && !this.#anyListeners.size) {
            console.error('[tradingview]', ...args);
            return;
        }
        for (const listener of [...(set ?? [])])
            Emitter.#call(() => listener(...args));
        for (const listener of [...this.#anyListeners])
            Emitter.#call(() => listener(event, ...args));
    }
    static #call(fn) {
        try {
            const result = fn();
            if (result && typeof result === 'object' && 'then' in result) {
                Promise.resolve(result).catch((error) => {
                    console.error('[tradingview] Listener threw:', error);
                });
            }
        }
        catch (error) {
            console.error('[tradingview] Listener threw:', error);
        }
    }
}
