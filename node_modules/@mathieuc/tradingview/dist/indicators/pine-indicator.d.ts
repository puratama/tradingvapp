/** Pine input types sent by TradingView. */
export type PineInputType = 'text' | 'source' | 'integer' | 'float' | 'resolution' | 'bool' | 'color' | 'session' | 'symbol' | 'time' | 'price' | 'textarea' | (string & {});
export interface PineInput {
    /** Display name. */
    name: string;
    /** Name usable with `setInput` (inline name or sanitised display name). */
    inline: string;
    /** Internal ID, when the script defines one. */
    internalID?: string;
    tooltip?: string;
    type: PineInputType;
    value: unknown;
    isHidden: boolean;
    isFake: boolean;
    /** Allowed values for select inputs. */
    options?: unknown[];
}
/** Study type used to create the indicator on a chart. */
export type PineStudyType = 'Script@tv-scripting-101!' | 'StrategyScript@tv-scripting-101!';
export interface PineIndicatorDefinition {
    /** Script ID, like `STD;RSI`, `PUB;xxxx` or `USER;xxxx`. */
    id: string;
    version: string;
    description: string;
    shortDescription: string;
    /** Inputs indexed by input ID (`in_0`, `in_1`...). */
    inputs: Record<string, PineInput>;
    /** Plot names indexed by plot ID (`plot_0`...). */
    plots: Record<string, string>;
    /** Compiled script (IL template) sent to the chart. */
    script: string;
    /** Study type. Defaults to `Script@tv-scripting-101!`. */
    type?: PineStudyType;
}
/** A Pine script (built-in, public, invite-only or private) ready to run on a chart. */
export declare class PineIndicator {
    #private;
    readonly id: string;
    readonly version: string;
    readonly description: string;
    readonly shortDescription: string;
    readonly inputs: Record<string, PineInput>;
    readonly plots: Record<string, string>;
    readonly script: string;
    constructor(definition: PineIndicatorDefinition);
    /** Study type used to create the indicator on a chart. */
    get type(): PineStudyType;
    /** Changes the study type, for example to run a strategy as `StrategyScript`. */
    setType(type: PineStudyType): this;
    /** Finds the input ID for an input ID (`in_0`), its number (`0`), inline name or internal ID. */
    findInput(key: string | number): string | undefined;
    /**
     * Changes an input value, with type and option validation.
     * @param key Input ID (`in_0`), number (`0`), inline name or internal ID.
     */
    setInput(key: string | number, value: unknown): this;
    /** Changes several inputs at once. */
    setInputs(values: Record<string, unknown>): this;
    /** Independent copy, so one definition can run with different inputs. */
    clone(): PineIndicator;
    /** Parameters sent with `create_study` / `modify_study`. */
    toStudyInputs(): Record<string, unknown>;
}
