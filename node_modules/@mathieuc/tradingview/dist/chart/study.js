import { TradingViewError } from '../errors.js';
import { Emitter } from '../events.js';
import { BuiltInIndicator } from '../indicators/builtin-indicator.js';
import { PineIndicator } from '../indicators/pine-indicator.js';
import { decodeCompressed } from '../protocol/compression.js';
import { createSessionId } from '../protocol/ids.js';
import { applyGraphicsCommands, parseGraphics, } from './graphics.js';
import { mergeStrategyReport, } from './strategy.js';
function assertIndicator(indicator) {
    if (!(indicator instanceof PineIndicator) && !(indicator instanceof BuiltInIndicator)) {
        throw new TradingViewError('INVALID_ARGUMENT', 'The indicator must be a PineIndicator (see getIndicator) or a BuiltInIndicator');
    }
}
/** Formats a `study_error` payload into a readable message. */
function studyErrorMessage(error) {
    if (error && typeof error === 'object' && 'error' in error) {
        const { error: template, ctx } = error;
        if (typeof template === 'string') {
            return template.replace(/\{(\w+)\}/g, (all, key) => (ctx && key in ctx ? String(ctx[key]) : all));
        }
    }
    return typeof error === 'string' ? error : JSON.stringify(error);
}
/** An indicator running on a chart. Create it with `chart.createStudy(indicator)`. */
export class Study extends Emitter {
    id = createSessionId('st');
    #bridge;
    #values = new Map();
    #graphics = {};
    #graphicIndexes = [];
    #strategyReport = { trades: [], history: {}, performance: {} };
    #indicator;
    #removed = false;
    #ready = false;
    /** @internal Use `chart.createStudy()`. */
    constructor(bridge, indicator) {
        super();
        assertIndicator(indicator);
        this.#bridge = bridge;
        this.#indicator = indicator;
    }
    /** @internal */
    create() {
        this.#bridge.send('create_study', [
            this.#bridge.chartId, this.id, 'st1', '$prices', this.#indicator.type, this.#indicator.toStudyInputs(),
        ]);
    }
    /** The indicator definition running in this study. */
    get indicator() {
        return this.#indicator;
    }
    /** True after the first `study_completed`. */
    get isReady() {
        return this.#ready;
    }
    /** True after `remove()` or when the chart is gone. */
    get isRemoved() {
        return this.#removed;
    }
    /** Plot values, oldest first. */
    get values() {
        return [...this.#values.values()].sort((a, b) => a.$time - b.$time);
    }
    /** Drawings (labels, lines, boxes, tables...) produced by the indicator. */
    get graphics() {
        const barsBack = this.#bridge.barsBack();
        return parseGraphics(this.#graphics, this.#graphicIndexes.map((index) => barsBack.get(index)));
    }
    /** Strategy report (Pine strategies only). */
    get strategyReport() {
        return this.#strategyReport;
    }
    /** Replaces the indicator (typically the same script with new inputs). */
    setIndicator(indicator) {
        assertIndicator(indicator);
        if (this.#removed)
            throw new TradingViewError('INVALID_STATE', 'The study is removed');
        this.#indicator = indicator;
        this.#bridge.send('modify_study', [this.#bridge.chartId, this.id, 'st1', indicator.toStudyInputs()]);
    }
    /** Removes the study from the chart. Idempotent. */
    remove() {
        if (this.#removed)
            return;
        this.#bridge.send('remove_study', [this.#bridge.chartId, this.id]);
        this.#removed = true;
        this.#bridge.unregister(this.id);
    }
    /** @internal Called when the chart or connection is gone; `error` is reported if set. */
    dispose(error) {
        if (this.#removed)
            return;
        this.#removed = true;
        if (error)
            this.emit('error', error);
    }
    /** @internal Packets addressed to this study (`study_*`). */
    onPacket(packet) {
        this.#bridge.log('study', this.id, packet);
        switch (packet.m) {
            case 'study_loading':
                this.emit('loading');
                return;
            case 'study_completed':
                this.#ready = true;
                this.emit('ready');
                return;
            case 'study_error':
                this.emit('error', new TradingViewError('STUDY_ERROR', `Study error: ${studyErrorMessage(packet.p[3])}`, {
                    details: packet.p.slice(3),
                }));
                return;
            default:
        }
    }
    /** @internal Data from `timescale_update` / `du`. */
    onData(data) {
        if (!data || typeof data !== 'object')
            return;
        const changes = [];
        if (Array.isArray(data.st) && data.st.length > 0) {
            const { plots } = this.#indicator instanceof PineIndicator ? this.#indicator : { plots: undefined };
            for (const row of data.st) {
                const value = {};
                row.v.forEach((plot, i) => {
                    if (i === 0) {
                        value.$time = plot;
                        return;
                    }
                    const name = plots?.[`plot_${i - 1}`];
                    if (name && !(name in value))
                        value[name] = plot;
                    else
                        value[`plot_${i - 1}`] = plot;
                });
                this.#values.set(value.$time, value);
            }
            changes.push('plots');
        }
        const ns = data.ns;
        if (ns?.d) {
            let parsed;
            try {
                parsed = JSON.parse(ns.d);
            }
            catch (error) {
                this.emit('error', new TradingViewError('PARSE_ERROR', 'Unable to parse study data', { cause: error }));
            }
            if (parsed?.graphicsCmds) {
                applyGraphicsCommands(this.#graphics, parsed.graphicsCmds);
                changes.push('graphic');
            }
            if (parsed?.dataCompressed) {
                try {
                    const decoded = decodeCompressed(parsed.dataCompressed);
                    changes.push(...mergeStrategyReport(this.#strategyReport, decoded?.report));
                }
                catch (error) {
                    this.emit('error', new TradingViewError('PARSE_ERROR', 'Unable to parse compressed strategy report', {
                        cause: error,
                    }));
                }
            }
            if (parsed?.data?.report) {
                try {
                    changes.push(...mergeStrategyReport(this.#strategyReport, parsed.data.report));
                }
                catch (error) {
                    this.emit('error', new TradingViewError('PARSE_ERROR', 'Unable to parse strategy report', {
                        cause: error,
                    }));
                }
            }
        }
        if (Array.isArray(ns?.indexes))
            this.#graphicIndexes = ns.indexes;
        this.emit('update', changes);
    }
}
