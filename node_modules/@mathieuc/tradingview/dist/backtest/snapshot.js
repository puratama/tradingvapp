import { createHash } from 'node:crypto';
import { TradingViewError } from '../errors.js';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
function freezeDeep(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const key of Object.keys(value))
            freezeDeep(value[key]);
        Object.freeze(value);
    }
    return value;
}
function invalid(message) {
    return new TradingViewError('INVALID_ARGUMENT', message);
}
/** Most common interval between consecutive bars. */
function inferBarSeconds(candles) {
    const counts = new Map();
    for (let i = 1; i < candles.length; i++) {
        const diff = candles[i].time - candles[i - 1].time;
        counts.set(diff, (counts.get(diff) ?? 0) + 1);
    }
    let best = 0;
    let bestCount = 0;
    for (const [diff, count] of counts)
        if (count > bestCount)
            [best, bestCount] = [diff, count];
    return best;
}
/**
 * Validates candles once and freezes them. The bar that is still forming (its close time is
 * after `now`) is dropped: its high, low and close are not final yet.
 * Gaps are intervals longer than 1.5 bars (market closures also show up as gaps).
 */
export function freezeSnapshot(rawCandles, meta = {}) {
    if (!Array.isArray(rawCandles))
        throw invalid('candles must be an array');
    const candles = rawCandles.map(({ time, open, high, low, close, volume }) => ({
        time, open, high, low, close, volume: volume ?? 0,
    }));
    candles.forEach((c, i) => {
        if (![c.time, c.open, c.high, c.low, c.close].every(isNumber))
            throw invalid(`Invalid candle at index ${i}`);
        if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close))
            throw invalid(`Inconsistent OHLC at index ${i}`);
        if (i > 0 && c.time <= candles[i - 1].time)
            throw invalid(`Candles are not strictly ordered at index ${i}`);
    });
    const barSeconds = meta.barSeconds ?? inferBarSeconds(candles);
    if (!isNumber(barSeconds) || barSeconds <= 0)
        throw invalid('barSeconds must be a positive number');
    const now = meta.now ?? Date.now() / 1000;
    let droppedFormingBar = false;
    if (candles.length > 0 && candles[candles.length - 1].time + barSeconds > now) {
        candles.pop();
        droppedFormingBar = true;
    }
    if (candles.length < 2)
        throw invalid('Not enough closed candles');
    const gaps = [];
    for (let i = 1; i < candles.length; i++) {
        const diff = candles[i].time - candles[i - 1].time;
        if (diff > barSeconds * 1.5) {
            gaps.push({ afterTime: candles[i - 1].time, beforeTime: candles[i].time, missingBars: Math.round(diff / barSeconds) - 1 });
        }
    }
    const firstTime = candles[0].time;
    const lastTime = candles[candles.length - 1].time;
    return freezeDeep({
        symbol: meta.symbol ?? '',
        timeframe: String(meta.timeframe ?? ''),
        barSeconds,
        count: candles.length,
        firstTime,
        lastTime,
        spanYears: (lastTime + barSeconds - firstTime) / (365.25 * 86_400),
        gaps,
        droppedFormingBar,
        fetchedAt: meta.fetchedAt === undefined ? Math.floor(Date.now() / 1000) : meta.fetchedAt,
        sha256: createHash('sha256').update(JSON.stringify(candles)).digest('hex'),
        candles,
    });
}
/**
 * Restores a snapshot saved with `JSON.stringify(snapshot)` and checks its SHA-256,
 * so that a replay runs on exactly the same data.
 */
export function loadSnapshot(saved) {
    const data = typeof saved === 'string' ? JSON.parse(saved) : saved;
    if (!data || !Array.isArray(data.candles))
        throw invalid('Not a saved snapshot');
    const snapshot = freezeSnapshot(data.candles, {
        symbol: data.symbol, timeframe: data.timeframe, barSeconds: data.barSeconds, now: Infinity, fetchedAt: data.fetchedAt ?? null,
    });
    if (snapshot.sha256 !== data.sha256)
        throw invalid('Snapshot checksum mismatch');
    // Keep the forming-bar flag recorded at capture time.
    return freezeDeep({ ...snapshot, droppedFormingBar: Boolean(data.droppedFormingBar) });
}
/** Snapshot metadata without the candles. */
export function snapshotInfo(snapshot) {
    const info = { ...snapshot };
    delete info.candles;
    return info;
}
