/** Known built-in (non-Pine) study types. Any other type string is accepted too. */
export type BuiltInIndicatorType = 'Volume@tv-basicstudies-241' | 'VbPFixed@tv-basicstudies-241' | 'VbPFixed@tv-basicstudies-241!' | 'VbPFixed@tv-volumebyprice-53!' | 'VbPSessions@tv-volumebyprice-53' | 'VbPSessionsRough@tv-volumebyprice-53!' | 'VbPSessionsDetailed@tv-volumebyprice-53!' | 'VbPVisible@tv-volumebyprice-53' | (string & {});
export type BuiltInIndicatorOption = 'length' | 'col_prev_close' | 'rowsLayout' | 'rows' | 'volume' | 'vaVolume' | 'subscribeRealtime' | 'first_bar_time' | 'first_visible_bar_time' | 'last_bar_time' | 'last_visible_bar_time' | 'extendToRight' | 'mapRightBoundaryToBarStartTime' | 'extendPocRight' | (string & {});
/** A built-in TradingView study such as Volume or Volume Profile. */
export declare class BuiltInIndicator {
    #private;
    readonly type: BuiltInIndicatorType;
    readonly options: Record<string, unknown>;
    constructor(type: BuiltInIndicatorType, options?: Record<string, unknown>);
    /**
     * Changes an option. For known types, the key and value type are validated
     * unless `force` is true.
     */
    setOption(key: BuiltInIndicatorOption, value: unknown, force?: boolean): this;
    /** Parameters sent with `create_study` / `modify_study`. */
    toStudyInputs(): Record<string, unknown>;
}
