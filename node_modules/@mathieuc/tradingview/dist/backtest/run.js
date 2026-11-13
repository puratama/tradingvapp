import { createRequire } from 'node:module';
import { timeframeSeconds } from '../chart/timeframes.js';
import { getCandles } from '../data/candles.js';
import { TradingViewError } from '../errors.js';
import { defaultExits } from './exits.js';
import { fillPrice, simulate, splitSegments, tradeReturn, } from './simulate.js';
import { freezeSnapshot, snapshotInfo, } from './snapshot.js';
import { computeMetrics, createRng, deriveSeed, percentileRank, randomBaseline, } from './stats.js';
export const BACKTEST_DEFAULTS = Object.freeze({
    fee: 0.001,
    slippage: 0.0005,
    splitRatio: 0.7,
    runs: 1000,
    seed: 42,
    causalityChecks: 100,
    signalWarmupBars: 200,
    minYears: 2,
});
const pkg = createRequire(import.meta.url)('../../package.json');
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
function invalid(message) {
    return new TradingViewError('INVALID_ARGUMENT', message);
}
function checkOption(name, value, ok) {
    if (!isNumber(value) || !ok)
        throw invalid(`${name} is out of range: ${value}`);
    return value;
}
/** Validates and sorts (stable, by bar) what the signal function returned. */
function normaliseSignals(raw, barCount) {
    if (!Array.isArray(raw))
        throw invalid('signal() must return an array of { bar, direction }');
    raw.forEach((s, i) => {
        if (!s || !Number.isInteger(s.bar) || s.bar < 0 || s.bar >= barCount) {
            throw invalid(`signal() returned an invalid bar at index ${i}: ${s?.bar} (expected an integer bar index from 0 to ${barCount - 1})`);
        }
        if (s.direction !== 'long' && s.direction !== 'short')
            throw invalid(`signal() returned an invalid direction at index ${i}: ${s.direction}`);
    });
    return [...raw].sort((a, b) => a.bar - b.bar);
}
function signalCounts(signals, before) {
    const counts = new Map();
    for (const s of signals) {
        if (s.bar >= before)
            break;
        const key = `${s.bar}:${s.direction}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}
function violationsAt(cut, full, truncated) {
    const expected = signalCounts(full, cut);
    const actual = signalCounts(truncated, cut);
    const out = [];
    const diff = (a, b, kind) => {
        for (const [key, count] of a) {
            if ((b.get(key) ?? 0) < count) {
                const [bar, direction] = key.split(':');
                out.push({ cut, bar: Number(bar), direction: direction, kind });
            }
        }
    };
    diff(expected, actual, 'look_ahead');
    diff(actual, expected, 'repaint');
    return out.sort((a, b) => a.bar - b.bar);
}
/**
 * Reruns `signal` on truncated copies of the candles and compares the signals it gives up to
 * each cut with those of the full run. A signal must be identical whether or not later bars
 * exist; otherwise it used information from after its bar (look-ahead) or changes when new
 * bars arrive (repaint). Cuts: the bar right after each checked signal (at most `maxSignals`,
 * picked with a seeded draw when there are more) and 8 evenly spaced bars after `fromBar`.
 */
export function checkCausality(signal, candles, options = {}) {
    const full = options.fullSignals ?? normaliseSignals(signal(candles), candles.length);
    const maxSignals = options.maxSignals ?? BACKTEST_DEFAULTS.causalityChecks;
    const fromBar = Math.max(1, options.fromBar ?? 0);
    const candidates = [...new Set(full.map((s) => s.bar + 1))].filter((cut) => cut < candles.length);
    let signalCuts = candidates;
    if (candidates.length > maxSignals) {
        const rng = createRng(options.seed ?? BACKTEST_DEFAULTS.seed);
        const picked = new Set();
        while (picked.size < maxSignals)
            picked.add(candidates[Math.floor(rng() * candidates.length)]);
        signalCuts = [...picked];
    }
    const cuts = new Set(signalCuts);
    if (maxSignals > 0) {
        for (let j = 1; j <= 8; j++) {
            const cut = fromBar + Math.round(((candles.length - fromBar) * j) / 9);
            if (cut > 1 && cut < candles.length)
                cuts.add(cut);
        }
    }
    const violations = [];
    for (const cut of [...cuts].sort((a, b) => a - b)) {
        const prefix = Object.freeze(candles.slice(0, cut));
        violations.push(...violationsAt(cut, full, normaliseSignals(signal(prefix), cut)));
    }
    const checkedBars = new Set(signalCuts.map((cut) => cut - 1));
    return {
        violations,
        check: {
            reruns: cuts.size,
            checkedSignals: full.filter((s) => checkedBars.has(s.bar)).length,
            totalSignals: full.length,
        },
    };
}
function lookAheadError(violations, candles) {
    const first = violations[0];
    const time = new Date(candles[first.bar].time * 1000).toISOString();
    const what = first.kind === 'look_ahead'
        ? `appears with the full history but not when the history ends at bar ${first.cut - 1}: it uses bars after its own bar`
        : `appears when the history ends at bar ${first.cut - 1} but not with the full history: it changes when later bars arrive (repaint)`;
    return new TradingViewError('LOOK_AHEAD', `The ${first.direction} signal at bar ${first.bar} (${time}) ${what}. `
        + `${violations.length} causality violation(s) found. A signal decided at the close of bar i may only use bars 0..i `
        + '(a pivot with lookback N is only known N bars later). Results would be unreliable, so the backtest stopped.', { details: violations });
}
function toSnapshot(input) {
    if (Array.isArray(input))
        return freezeSnapshot(input);
    const snapshot = input;
    if (!snapshot || !Array.isArray(snapshot.candles) || !Object.isFrozen(snapshot.candles) || typeof snapshot.sha256 !== 'string') {
        throw invalid('runBacktest() expects candles or a snapshot from freezeSnapshot() / loadSnapshot()');
    }
    return snapshot;
}
function segmentInfo(segment, candles, costs) {
    const empty = segment.end <= segment.start;
    const buyHold = () => tradeReturn('long', fillPrice('entry', 'long', candles[segment.start].open, costs.slippage), fillPrice('exit', 'long', candles[segment.end - 1].close, costs.slippage), costs.fee);
    return {
        ...segment,
        bars: Math.max(0, segment.end - segment.start),
        startTime: empty ? null : candles[segment.start].time,
        endTime: empty ? null : candles[segment.end - 1].time,
        buyHold: empty ? null : buyHold(),
    };
}
const validRefs = (refs, candles) => Object.entries(refs ?? {})
    .filter(([, bar]) => Number.isInteger(bar) && candles[bar]);
const refTimes = (refs, candles) => Object.fromEntries(validRefs(refs, candles).map(([name, bar]) => [name, candles[bar].time]));
const refBars = (refs, candles) => Object.fromEntries(validRefs(refs, candles));
/** Resolves the warm-up: explicit option, else the largest need of the signal and exits. */
export function resolveWarmupBars(signal, exits, warmupBars) {
    if (warmupBars !== undefined)
        return checkOption('warmupBars', warmupBars, Number.isInteger(warmupBars) && warmupBars >= 0);
    return Math.max(signal.warmupBars ?? BACKTEST_DEFAULTS.signalWarmupBars, ...exits.map((e) => e.warmupBars ?? 0));
}
function resolveOptions(options) {
    if (typeof options?.signal !== 'function')
        throw invalid('options.signal must be a function (candles) => [{ bar, direction }]');
    const o = { ...BACKTEST_DEFAULTS, ...options };
    checkOption('fee', o.fee, o.fee >= 0 && o.fee < 1);
    checkOption('slippage', o.slippage, o.slippage >= 0 && o.slippage < 1);
    checkOption('splitRatio', o.splitRatio, o.splitRatio > 0 && o.splitRatio < 1);
    checkOption('runs', o.runs, Number.isInteger(o.runs) && o.runs >= 0);
    checkOption('seed', o.seed, Number.isInteger(o.seed));
    checkOption('causalityChecks', o.causalityChecks, Number.isInteger(o.causalityChecks) && o.causalityChecks >= 0);
    const exits = options.exits ?? defaultExits();
    if (!Array.isArray(exits) || exits.length === 0)
        throw invalid('exits must be a non-empty array');
    if (new Set(exits.map((e) => e.id)).size !== exits.length)
        throw invalid('exit ids must be unique');
    return { ...o, exits, warmupBars: resolveWarmupBars(options.signal, exits, options.warmupBars) };
}
/** Signals of the full history, rejected when the same rule on shorter history disagrees. */
function causalSignals(o, candles) {
    const signals = normaliseSignals(o.signal(candles), candles.length);
    if (o.causalityChecks === 0)
        return { signals, causality: { reruns: 0, checkedSignals: 0, totalSignals: signals.length } };
    const result = checkCausality(o.signal, candles, {
        fullSignals: signals, maxSignals: o.causalityChecks, fromBar: o.warmupBars, seed: o.seed,
    });
    if (result.violations.length)
        throw lookAheadError(result.violations, candles);
    return { signals, causality: result.check };
}
function tradeRecord(t, exit, split, candles) {
    return {
        exit,
        split,
        direction: t.direction,
        signalBar: t.signalBar,
        signalTime: candles[t.signalBar].time,
        entryBar: t.entryBar,
        entryTime: candles[t.entryBar].time,
        refs: refTimes(t.refs, candles),
        refBars: refBars(t.refs, candles),
        entryOpen: t.entryOpen,
        entryPrice: t.entryPrice,
        initialStop: t.initialStop,
        target: t.target,
        exitBar: t.exitBar,
        exitTime: candles[t.exitBar].time,
        exitLevel: t.exitLevel,
        exitPrice: t.exitPrice,
        reason: t.reason,
        return: t.return,
    };
}
/** One exit on one segment: strategy trades, metrics and the random baseline. */
function evaluate(o, candles, entries, exit, segment) {
    const costs = { fee: o.fee, slippage: o.slippage };
    const result = simulate({ candles, entries, exit, costs, segment });
    const metrics = computeMetrics(result.trades);
    const longs = result.trades.filter((t) => t.direction === 'long').length;
    const baseline = metrics.trades > 0 && o.runs > 0
        ? randomBaseline({
            candles, exit, costs, segment,
            tradeCount: metrics.trades,
            longShare: longs / metrics.trades,
            runs: o.runs,
            seed: deriveSeed(o.seed, exit.id, segment.name),
        })
        : null;
    const split = segment.name;
    const row = {
        exit: exit.id,
        split,
        metrics,
        longs,
        shorts: metrics.trades - longs,
        skippedInPosition: result.skippedInPosition,
        baseline: baseline && {
            runs: baseline.runs, seed: baseline.seed, matchedRuns: baseline.matchedRuns, meanTrades: baseline.meanTrades,
            p5: baseline.p5, p50: baseline.p50, p95: baseline.p95,
        },
        percentile: baseline && percentileRank(metrics.netReturn, baseline.netReturns),
    };
    return { row, trades: result.trades.map((t) => tradeRecord(t, exit.id, split, candles)) };
}
function reportWarnings(o, snapshot, tradableYears, signals, rows) {
    const warnings = [];
    if (tradableYears < o.minYears)
        warnings.push({ code: 'short_history', years: tradableYears, wantedYears: o.minYears });
    if (signals.length === 0)
        warnings.push({ code: 'no_signals' });
    const fewest = Math.min(...rows.map((r) => r.metrics.trades));
    if (fewest < 30)
        warnings.push({ code: 'few_trades', trades: fewest });
    for (const row of rows) {
        if (row.baseline && row.baseline.matchedRuns < row.baseline.runs) {
            warnings.push({
                code: 'baseline_unmatched', exit: row.exit, split: row.split, matchedRuns: row.baseline.matchedRuns,
                runs: row.baseline.runs, trades: row.metrics.trades, meanTrades: row.baseline.meanTrades,
            });
        }
    }
    if (o.causalityChecks === 0)
        warnings.push({ code: 'causality_disabled' });
    if (snapshot.gaps.length) {
        warnings.push({ code: 'data_gaps', gaps: snapshot.gaps.length, missingBars: snapshot.gaps.reduce((sum, g) => sum + g.missingBars, 0) });
    }
    return warnings;
}
function signalRecord(s, candles, segments) {
    const segment = segments.find((seg) => s.bar >= seg.start && s.bar + 1 < seg.end);
    return {
        bar: s.bar,
        time: candles[s.bar].time,
        direction: s.direction,
        entryBar: s.bar + 1,
        entryTime: candles[s.bar + 1]?.time ?? null,
        split: (segment?.name ?? null),
        refs: refTimes(s.refs, candles),
        refBars: refBars(s.refs, candles),
    };
}
/**
 * Runs the full protocol on frozen candles, synchronously and without network:
 * causality check of the signal, warm-up, chronological IS/OOS split, every exit on the same
 * entries, costs on both sides, metrics per exit and split, seeded random-entry baseline.
 * Throws a `LOOK_AHEAD` TradingViewError when the signal uses future bars.
 *
 * @example
 * const report = runBacktest(candles, { signal: (bars) => bars.flatMap((b, i) => ...) });
 * console.log(formatReport(report));
 */
export function runBacktest(input, options) {
    const o = resolveOptions(options);
    const snapshot = toSnapshot(input);
    const { candles } = snapshot;
    // 1. Signals, then their causality: the same rule on shorter history must agree.
    const { signals, causality } = causalSignals(o, candles);
    // 2. Chronological split and entries (always the open of the bar after the signal).
    const { inSample, outOfSample } = splitSegments(candles.length, o.warmupBars, o.splitRatio);
    const entries = signals.map((s) => ({
        direction: s.direction, signalBar: s.bar, entryBar: s.bar + 1, ...(s.refs ? { refs: s.refs } : {}),
    }));
    // 3. Every exit on every segment, with its random baseline.
    const results = o.exits.flatMap((exit) => [inSample, outOfSample].map((segment) => evaluate(o, candles, entries, exit, segment)));
    const rows = results.map((r) => r.row);
    const tradableYears = ((candles.length - inSample.start) * snapshot.barSeconds) / (365.25 * 86_400);
    const costs = { fee: o.fee, slippage: o.slippage };
    return {
        createdAt: Math.floor(Date.now() / 1000),
        library: { name: pkg.name, version: pkg.version },
        snapshot: snapshotInfo(snapshot),
        settings: {
            signal: {
                id: o.signal.id ?? (o.signal.name || 'custom'),
                params: { ...(o.signal.params ?? {}) },
                label: o.signal.label ?? (o.signal.name || 'custom signal'),
            },
            fee: o.fee,
            slippage: o.slippage,
            splitRatio: o.splitRatio,
            warmupBars: o.warmupBars,
            runs: o.runs,
            seed: o.seed,
            exits: o.exits.map((e) => ({ id: e.id, kind: e.kind ?? null, params: { ...(e.params ?? {}) }, label: e.label })),
        },
        segments: {
            warmup: segmentInfo({ name: 'warmup', start: 0, end: inSample.start }, candles, costs),
            inSample: segmentInfo(inSample, candles, costs),
            outOfSample: segmentInfo(outOfSample, candles, costs),
        },
        tradableYears,
        signals: signals.map((s) => signalRecord(s, candles, [inSample, outOfSample])),
        rows,
        trades: results.flatMap((r) => r.trades),
        causality,
        warnings: reportWarnings(o, snapshot, tradableYears, signals, rows),
    };
}
/**
 * Downloads candles once with `getCandles` and freezes them (forming bar dropped, gaps and
 * SHA-256 recorded). Save the result with `JSON.stringify` and replay it with `loadSnapshot`.
 */
export async function fetchSnapshot(query) {
    const timeframe = query.timeframe ?? '240';
    const barSeconds = timeframeSeconds(timeframe);
    if (!barSeconds)
        throw invalid(`Backtests need a time-based timeframe, got ${timeframe}`);
    const years = query.years ?? BACKTEST_DEFAULTS.minYears;
    const warmup = query.warmupBars ?? BACKTEST_DEFAULTS.signalWarmupBars;
    const range = query.from !== undefined
        ? { from: query.from, to: query.to }
        : { count: query.count ?? Math.ceil((years * 365.25 * 86_400) / barSeconds) + warmup + 1 };
    const candles = await getCandles({
        symbol: query.symbol,
        timeframe,
        ...range,
        timeoutMs: query.timeoutMs ?? 120_000,
        ...(query.credentials ? { credentials: query.credentials } : {}),
        ...(query.client ? { client: query.client } : {}),
        ...(query.clientOptions ? { clientOptions: query.clientOptions } : {}),
        ...(query.abortSignal ? { signal: query.abortSignal } : {}),
    }, query.provider);
    return freezeSnapshot(candles, { symbol: query.symbol, timeframe, barSeconds });
}
/**
 * One call: download (or replay) the candles, freeze them, run the whole protocol.
 * Returns the JSON report and the frozen snapshot (candles included, for charts and replays).
 *
 * @example
 * import { backtest, formatReport } from '@mathieuc/tradingview/backtest';
 * const { report, snapshot } = await backtest({
 *   symbol: 'BINANCE:BTCUSDT', timeframe: '240', years: 2,
 *   signal: (candles) => candles.flatMap((c, i) => (i > 0 && c.close > candles[i - 1].high ? [{ bar: i, direction: 'long' }] : [])),
 * });
 * console.log(formatReport(report));
 * writeFileSync('snapshot.json', JSON.stringify(snapshot)); // Replay later with { snapshot: loadSnapshot(...) }
 */
export async function backtest(query) {
    if (typeof query?.signal !== 'function')
        throw invalid('signal must be a function (candles) => [{ bar, direction }]');
    const exits = query.exits ?? defaultExits();
    const warmupBars = resolveWarmupBars(query.signal, exits, query.warmupBars);
    const snapshot = query.snapshot ?? await fetchSnapshot({ ...query, warmupBars });
    const report = runBacktest(snapshot, {
        ...query, exits, warmupBars, minYears: query.years ?? BACKTEST_DEFAULTS.minYears,
    });
    return { report, snapshot };
}
/**
 * The same signal on several markets, one after the other (one download each, or a replay).
 * Every trade gets `series` = the market id, so `tradesToCsv(results.flatMap((r) => r.report.trades))`
 * gives one CSV for all of them.
 */
export async function backtestMany(query) {
    if (!Array.isArray(query?.markets) || query.markets.length === 0)
        throw invalid('markets must be a non-empty array of { symbol, timeframe }');
    const results = [];
    for (const market of query.markets) {
        const id = `${market.symbol}_${market.timeframe}`;
        if (results.some((r) => r.id === id))
            throw invalid(`Duplicate market ${id}`);
        const exits = typeof query.exits === 'function' ? query.exits(market) : query.exits;
        const { report, snapshot } = await backtest({
            ...query, symbol: market.symbol, timeframe: market.timeframe, exits, snapshot: market.snapshot,
        });
        for (const trade of report.trades)
            trade.series = id;
        results.push({ id, symbol: market.symbol, timeframe: market.timeframe, report, snapshot });
    }
    return results;
}
