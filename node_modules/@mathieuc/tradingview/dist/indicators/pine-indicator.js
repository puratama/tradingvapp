import { TradingViewError } from '../errors.js';
const INPUT_TYPES = {
    bool: 'boolean',
    integer: 'number',
    float: 'number',
    text: 'string',
};
/** A Pine script (built-in, public, invite-only or private) ready to run on a chart. */
export class PineIndicator {
    id;
    version;
    description;
    shortDescription;
    inputs;
    plots;
    script;
    #type;
    constructor(definition) {
        this.id = definition.id;
        this.version = definition.version;
        this.description = definition.description;
        this.shortDescription = definition.shortDescription;
        this.inputs = structuredClone(definition.inputs);
        this.plots = { ...definition.plots };
        this.script = definition.script;
        this.#type = definition.type ?? 'Script@tv-scripting-101!';
    }
    /** Study type used to create the indicator on a chart. */
    get type() {
        return this.#type;
    }
    /** Changes the study type, for example to run a strategy as `StrategyScript`. */
    setType(type) {
        this.#type = type;
        return this;
    }
    /** Finds the input ID for an input ID (`in_0`), its number (`0`), inline name or internal ID. */
    findInput(key) {
        if (this.inputs[`in_${key}`])
            return `in_${key}`;
        if (this.inputs[key])
            return String(key);
        return Object.keys(this.inputs).find((id) => (this.inputs[id].inline === key || this.inputs[id].internalID === key));
    }
    /**
     * Changes an input value, with type and option validation.
     * @param key Input ID (`in_0`), number (`0`), inline name or internal ID.
     */
    setInput(key, value) {
        const id = this.findInput(key);
        if (!id)
            throw new TradingViewError('INVALID_ARGUMENT', `Input '${key}' not found`);
        const input = this.inputs[id];
        const expected = INPUT_TYPES[input.type];
        if (expected && typeof value !== expected) {
            throw new TradingViewError('INVALID_ARGUMENT', `Input '${input.name}' (${id}) must be a ${expected}`);
        }
        if (input.options && !input.options.includes(value)) {
            throw new TradingViewError('INVALID_ARGUMENT', `Input '${input.name}' (${id}) must be one of: ${input.options.map(String).join(', ')}`, { details: input.options });
        }
        input.value = value;
        return this;
    }
    /** Changes several inputs at once. */
    setInputs(values) {
        for (const [key, value] of Object.entries(values))
            this.setInput(key, value);
        return this;
    }
    /** Independent copy, so one definition can run with different inputs. */
    clone() {
        return new PineIndicator({
            id: this.id,
            version: this.version,
            description: this.description,
            shortDescription: this.shortDescription,
            inputs: this.inputs,
            plots: this.plots,
            script: this.script,
            type: this.#type,
        });
    }
    /** Parameters sent with `create_study` / `modify_study`. */
    toStudyInputs() {
        const inputs = { text: this.script };
        if (this.id)
            inputs.pineId = this.id;
        if (this.version)
            inputs.pineVersion = this.version;
        Object.keys(this.inputs).forEach((id, index) => {
            const input = this.inputs[id];
            inputs[id] = {
                // TradingView expects colour inputs as their position, not their value.
                v: input.type !== 'color' ? input.value : index,
                f: input.isFake,
                t: input.type,
            };
        });
        return inputs;
    }
}
