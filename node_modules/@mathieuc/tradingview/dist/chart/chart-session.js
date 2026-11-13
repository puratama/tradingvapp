import { TradingViewError } from '../errors.js';
import { Emitter } from '../events.js';
import { createSessionId } from '../protocol/ids.js';
import { Study } from './study.js';
import { CHART_TYPE_STUDIES, } from './types.js';
/**
 * A chart: one symbol series plus any number of studies, with optional
 * replay mode. Create it with `client.createChart()`.
 */
export class ChartSession extends Emitter {
    id = createSessionId('cs');
    replayId = createSessionId('rs');
    client;
    #candles = new Map();
    /** Bar index (`i`) → bar time, used to position study graphics. */
    #barIndexes = new Map();
    #studies = new Map();
    #replayRequests = new Map();
    #symbolInfo;
    #seriesCount = 0;
    #seriesCreated = false;
    #turnaround = 0;
    #timeframe = 'D';
    #replayMode = false;
    #deleted = false;
    constructor(client) {
        super();
        this.client = client;
        const chartHandler = {
            onPacket: (packet) => this.#onChartPacket(packet),
            onClose: (error, expected) => this.#onClientClose(error, expected),
        };
        client.registerSession(this.id, chartHandler);
        client.registerSession(this.replayId, { onPacket: (packet) => this.#onReplayPacket(packet) });
        client.send('chart_create_session', [this.id]);
    }
    /** Loaded bars, oldest first. */
    get candles() {
        return [...this.#candles.values()].sort((a, b) => a.time - b.time);
    }
    /** Most recent bar. */
    get lastCandle() {
        let last;
        for (const candle of this.#candles.values())
            if (!last || candle.time > last.time)
                last = candle;
        return last;
    }
    /** Symbol metadata, once resolved. */
    get symbolInfo() {
        return this.#symbolInfo;
    }
    /** Current timeframe. */
    get timeframe() {
        return this.#timeframe;
    }
    /** Current series ID (`ser_1`, `ser_2`...), or undefined before `setMarket`. */
    get seriesId() {
        return this.#seriesCount ? `ser_${this.#seriesCount}` : undefined;
    }
    /** True when the chart is in replay mode. */
    get isReplay() {
        return this.#replayMode;
    }
    /** True after `delete()` or when the connection closed. */
    get isDeleted() {
        return this.#deleted;
    }
    /** Studies currently on this chart. */
    get studies() {
        return [...this.#studies.values()];
    }
    /** Loads a symbol, optionally with a custom bar type or in replay mode. */
    setMarket(symbol, options = {}) {
        this.#assertAlive();
        if (!symbol)
            throw new TradingViewError('INVALID_ARGUMENT', 'A symbol is required');
        this.#candles.clear();
        this.#barIndexes.clear();
        this.#symbolInfo = undefined;
        const timeframe = options.timeframe ?? 'D';
        if (this.#replayMode) {
            this.#replayMode = false;
            this.#rejectReplayRequests(new TradingViewError('INVALID_STATE', 'Replay session replaced'));
            this.client.send('replay_delete_session', [this.replayId]);
        }
        const symbolInit = {
            symbol,
            adjustment: options.adjustment ?? 'splits',
        };
        if (options.backAdjustment)
            symbolInit.backadjustment = 'default';
        if (options.session)
            symbolInit.session = options.session;
        if (options.currency)
            symbolInit['currency-id'] = options.currency;
        if (options.replay !== undefined) {
            this.#replayMode = true;
            this.client.send('replay_create_session', [this.replayId]);
            this.client.send('replay_add_series', [
                this.replayId, 'req_replay_addseries', `=${JSON.stringify(symbolInit)}`, timeframe,
            ]);
            this.client.send('replay_reset', [this.replayId, 'req_replay_reset', options.replay]);
        }
        let chartInit = symbolInit;
        if (options.type || options.replay !== undefined) {
            chartInit = { symbol: symbolInit };
            if (options.replay !== undefined)
                chartInit.replay = this.replayId;
            if (options.type) {
                const study = CHART_TYPE_STUDIES[options.type];
                if (!study)
                    throw new TradingViewError('INVALID_ARGUMENT', `Unknown chart type '${options.type}'`);
                chartInit.type = study;
                chartInit.inputs = { ...options.inputs };
            }
        }
        this.#seriesCount += 1;
        this.client.send('resolve_symbol', [this.id, `ser_${this.#seriesCount}`, `=${JSON.stringify(chartInit)}`]);
        this.#sendSeries(timeframe, options.count ?? 100, options.to);
    }
    /** Changes the timeframe of the loaded symbol, keeping studies. */
    setTimeframe(timeframe) {
        this.#assertAlive();
        if (!this.#seriesCount) {
            throw new TradingViewError('INVALID_STATE', 'Please set the market before setting the timeframe');
        }
        this.#candles.clear();
        this.#barIndexes.clear();
        this.#sendSeries(timeframe, 100);
    }
    #sendSeries(timeframe, count, to) {
        this.#timeframe = timeframe;
        this.#turnaround += 1;
        const range = to === undefined ? count : ['bar_count', to, count];
        this.client.send(this.#seriesCreated ? 'modify_series' : 'create_series', [
            this.id, '$prices', `s${this.#turnaround}`, `ser_${this.#seriesCount}`, timeframe,
            // modify_series only accepts an empty range: the bar count is kept.
            this.#seriesCreated ? '' : range,
        ]);
        this.#seriesCreated = true;
    }
    /** Changes the chart timezone. */
    setTimezone(timezone) {
        this.#assertAlive();
        this.client.send('switch_timezone', [this.id, timezone]);
    }
    /**
     * Loads more history. Positive values load older bars; negative values
     * load newer bars after a past `to` reference.
     */
    fetchMore(count = 1) {
        this.#assertAlive();
        this.client.send('request_more_data', [this.id, '$prices', count]);
    }
    /** Moves the replay forward by `count` bars. */
    replayStep(count = 1) {
        return this.#replayRequest('replay_step', 'rsq_step', [count]);
    }
    /** Plays the replay automatically, one bar every `intervalMs`. */
    replayStart(intervalMs = 1000) {
        return this.#replayRequest('replay_start', 'rsq_start', [intervalMs]);
    }
    /** Pauses automatic replay. */
    replayStop() {
        return this.#replayRequest('replay_stop', 'rsq_stop', []);
    }
    #replayRequest(method, prefix, params) {
        if (this.#deleted)
            return Promise.reject(new TradingViewError('INVALID_STATE', 'The chart is deleted'));
        if (!this.#replayMode) {
            return Promise.reject(new TradingViewError('INVALID_STATE', 'No replay session: use setMarket(symbol, { replay })'));
        }
        const requestId = createSessionId(prefix);
        return new Promise((resolve, reject) => {
            this.#replayRequests.set(requestId, { resolve, reject });
            this.client.send(method, [this.replayId, requestId, ...params]);
        });
    }
    /** Adds a study (Pine or built-in indicator) to this chart. */
    createStudy(indicator) {
        this.#assertAlive();
        const bridge = {
            chartId: this.id,
            send: (method, params) => this.client.send(method, params),
            barsBack: () => this.#barsBack(),
            log: (...args) => this.client.log(...args),
            unregister: (id) => { this.#studies.delete(id); },
        };
        const study = new Study(bridge, indicator);
        this.#studies.set(study.id, study);
        study.create();
        return study;
    }
    /** Deletes the chart (and its replay session). Idempotent. */
    delete() {
        if (this.#deleted)
            return;
        if (!this.client.isClosed) {
            if (this.#replayMode)
                this.client.send('replay_delete_session', [this.replayId]);
            this.client.send('chart_delete_session', [this.id]);
        }
        this.#dispose(new TradingViewError('INVALID_STATE', 'The chart was deleted'));
    }
    #dispose(error, notify = false) {
        this.#deleted = true;
        this.#replayMode = false;
        this.client.unregisterSession(this.id);
        this.client.unregisterSession(this.replayId);
        this.#rejectReplayRequests(error);
        for (const study of this.#studies.values())
            study.dispose(notify ? error : undefined);
        this.#studies.clear();
    }
    #onClientClose(error, expected) {
        if (this.#deleted)
            return;
        this.#dispose(error, !expected);
        if (!expected)
            this.emit('error', error);
    }
    #assertAlive() {
        if (this.#deleted)
            throw new TradingViewError('INVALID_STATE', 'The chart is deleted');
    }
    #rejectReplayRequests(error) {
        for (const request of this.#replayRequests.values())
            request.reject(error);
        this.#replayRequests.clear();
    }
    /** Bar index → bars back from the most recent loaded bar. */
    #barsBack() {
        const result = new Map();
        [...this.#barIndexes.entries()]
            .sort((a, b) => b[1] - a[1])
            .forEach(([index], position) => result.set(index, position));
        return result;
    }
    #onChartPacket(packet) {
        this.client.log('chart', this.id, packet);
        const [, target] = packet.p;
        if (typeof target === 'string' && this.#studies.has(target)) {
            this.#studies.get(target)?.onPacket(packet);
            return;
        }
        switch (packet.m) {
            case 'symbol_resolved':
                this.#symbolInfo = { series_id: target, ...packet.p[2] };
                this.emit('symbolLoaded', this.#symbolInfo);
                return;
            case 'timescale_update':
            case 'du': {
                const data = (packet.p[1] ?? {});
                const changes = [];
                for (const key of Object.keys(data)) {
                    changes.push(key);
                    if (key === '$prices')
                        this.#updateCandles(data.$prices);
                    else
                        this.#studies.get(key)?.onData(data[key]);
                }
                this.emit('update', changes);
                return;
            }
            case 'series_loading':
                this.emit('seriesLoading');
                return;
            case 'series_completed': {
                const details = (packet.p[4] ?? {});
                this.emit('seriesCompleted', {
                    status: String(packet.p[2] ?? ''),
                    dataCompleted: details.data_completed,
                    turnaround: String(packet.p[3] ?? ''),
                    raw: packet.p,
                });
                return;
            }
            case 'symbol_error':
                this.emit('error', new TradingViewError('SYMBOL_ERROR', `(${String(target)}) Symbol error: ${String(packet.p[2])}`, {
                    details: packet.p,
                }));
                return;
            case 'series_error':
                this.emit('error', new TradingViewError('SERIES_ERROR', `Series error: ${String(packet.p[3])}`, {
                    details: packet.p,
                }));
                return;
            case 'critical_error':
                this.emit('error', new TradingViewError('CRITICAL_ERROR', `Critical error: ${String(packet.p[1])}`, {
                    details: packet.p,
                }));
                return;
            default:
        }
    }
    #updateCandles(prices) {
        for (const bar of prices?.s ?? []) {
            const [time, open, high, low, close, volume] = bar.v;
            this.#barIndexes.set(bar.i, time);
            this.#candles.set(time, {
                time, open, high, low, close, volume: volume ?? 0,
            });
        }
    }
    #onReplayPacket(packet) {
        this.client.log('replay', this.replayId, packet);
        switch (packet.m) {
            case 'replay_ok': {
                const requestId = String(packet.p[1]);
                this.#replayRequests.get(requestId)?.resolve();
                this.#replayRequests.delete(requestId);
                return;
            }
            case 'replay_instance_id':
                this.emit('replayLoaded', String(packet.p[1]));
                return;
            case 'replay_point':
                this.emit('replayPoint', Number(packet.p[1]));
                return;
            case 'replay_resolutions':
                this.emit('replayResolution', String(packet.p[1]), String(packet.p[2]));
                return;
            case 'replay_data_end':
                this.emit('replayEnd');
                return;
            case 'critical_error':
            case 'replay_error': {
                const error = new TradingViewError('CRITICAL_ERROR', `Replay error: ${String(packet.p[1])}`, {
                    details: packet.p,
                });
                this.#rejectReplayRequests(error);
                this.emit('error', error);
                return;
            }
            default:
        }
    }
}
