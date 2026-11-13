import { TradingViewError } from '../errors.js';
function defaultOptions(type) {
    const now = Date.now();
    const profile = {
        rowsLayout: 'Number Of Rows', rows: 24, volume: 'Up/Down', vaVolume: 70,
    };
    switch (type) {
        case 'Volume@tv-basicstudies-241':
            return { length: 20, col_prev_close: false };
        case 'VbPFixed@tv-basicstudies-241':
            return {
                ...profile,
                subscribeRealtime: false,
                first_bar_time: NaN,
                last_bar_time: now,
                extendToRight: false,
                mapRightBoundaryToBarStartTime: true,
            };
        case 'VbPFixed@tv-basicstudies-241!':
        case 'VbPFixed@tv-volumebyprice-53!':
            return {
                ...profile, subscribeRealtime: false, first_bar_time: NaN, last_bar_time: now,
            };
        case 'VbPSessions@tv-volumebyprice-53':
            return { ...profile, extendPocRight: false };
        case 'VbPSessionsRough@tv-volumebyprice-53!':
            return { volume: 'Up/Down', vaVolume: 70 };
        case 'VbPSessionsDetailed@tv-volumebyprice-53!':
            return {
                volume: 'Up/Down', vaVolume: 70, subscribeRealtime: false, first_visible_bar_time: NaN, last_visible_bar_time: now,
            };
        case 'VbPVisible@tv-volumebyprice-53':
            return {
                ...profile, subscribeRealtime: false, first_visible_bar_time: NaN, last_visible_bar_time: now,
            };
        default:
            return undefined;
    }
}
/** A built-in TradingView study such as Volume or Volume Profile. */
export class BuiltInIndicator {
    type;
    options;
    #defaults;
    constructor(type, options = {}) {
        if (!type)
            throw new TradingViewError('INVALID_ARGUMENT', 'A built-in indicator type is required');
        this.type = type;
        this.#defaults = defaultOptions(type);
        this.options = { ...this.#defaults };
        for (const [key, value] of Object.entries(options))
            this.setOption(key, value);
    }
    /**
     * Changes an option. For known types, the key and value type are validated
     * unless `force` is true.
     */
    setOption(key, value, force = false) {
        if (!force && this.#defaults) {
            if (!(key in this.#defaults)) {
                throw new TradingViewError('INVALID_ARGUMENT', `Option '${key}' is not allowed for '${this.type}'`);
            }
            const expected = typeof this.#defaults[key];
            if (typeof value !== expected) {
                throw new TradingViewError('INVALID_ARGUMENT', `Option '${key}' must be a ${expected}`);
            }
        }
        this.options[key] = value;
        return this;
    }
    /** Parameters sent with `create_study` / `modify_study`. */
    toStudyInputs() {
        return { ...this.options };
    }
}
