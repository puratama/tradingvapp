import { TradingViewError } from '../errors.js';
import { cachedAtr } from './indicators.js';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const offset = (direction, price, distance) => (direction === 'long' ? price + distance : price - distance);
function positive(name, value) {
    if (!isNumber(value) || value <= 0)
        throw new TradingViewError('INVALID_ARGUMENT', `${name} must be a positive number`);
    return value;
}
/** Fixed stop at `stopPct` from the entry bar open, target at `targetR` times that distance. */
export function fixedExit({ stopPct, targetR }) {
    positive('stopPct', stopPct);
    if (targetR !== null)
        positive('targetR', targetR);
    return {
        id: targetR === null ? `fixed_stop${stopPct * 100}%` : `fixed_${targetR}R`,
        label: `Fixed ${(stopPct * 100).toFixed(1)}% stop, ${targetR === null ? 'no target' : `${targetR}:1 target`}`,
        kind: 'fixed',
        params: { stopPct, targetR },
        levels({ direction, entryOpen }) {
            const d = entryOpen * stopPct;
            return { stop: offset(direction, entryOpen, -d), target: targetR === null ? null : offset(direction, entryOpen, targetR * d) };
        },
    };
}
/** Stop at `mult` x ATR of the signal bar (last closed bar before entry), target at `targetR` R. */
export function atrExit({ mult, targetR, length = 14 }) {
    positive('mult', mult);
    positive('length', length);
    if (targetR !== null)
        positive('targetR', targetR);
    return {
        id: `atr${mult}_${targetR === null ? 'stop' : `${targetR}R`}`,
        label: `ATR(${length}) x${mult} stop, ${targetR === null ? 'no target' : `${targetR}R target`}`,
        kind: 'atr',
        params: { mult, targetR, length },
        warmupBars: length - 1,
        levels({ direction, entryOpen, signalBar, candles }) {
            const d = mult * cachedAtr(candles, length)[signalBar];
            if (!isNumber(d) || d <= 0)
                return null;
            return { stop: offset(direction, entryOpen, -d), target: targetR === null ? null : offset(direction, entryOpen, targetR * d) };
        },
    };
}
/**
 * ATR trailing stop, no target. Initial stop at `mult` x ATR of the signal bar, then, after
 * each CLOSED bar, ratcheted to close -/+ `mult` x ATR of that bar; the new stop applies from
 * the next bar.
 */
export function atrTrailingExit({ mult, length = 14 }) {
    positive('mult', mult);
    positive('length', length);
    return {
        id: `trail_atr${mult}`,
        label: `ATR(${length}) x${mult} trailing stop`,
        kind: 'atr_trailing',
        params: { mult, length },
        warmupBars: length - 1,
        levels({ direction, entryOpen, signalBar, candles }) {
            const d = mult * cachedAtr(candles, length)[signalBar];
            if (!isNumber(d) || d <= 0)
                return null;
            return { stop: offset(direction, entryOpen, -d), target: null };
        },
        trail(stop, bar, { direction, candles }) {
            const candidate = offset(direction, candles[bar].close, -mult * cachedAtr(candles, length)[bar]);
            if (!isNumber(candidate))
                return stop;
            return direction === 'long' ? Math.max(stop, candidate) : Math.min(stop, candidate);
        },
    };
}
/**
 * The four reference exits: fixed 2% stop with 1.5:1 and 2:1 targets, 1.5 x ATR stop with a
 * 2R target, and a 3 x ATR trailing stop.
 */
export function defaultExits(options = {}) {
    const { stopPct = 0.02, atrStopMult = 1.5, atrTargetR = 2, trailAtrMult = 3, atrLength = 14 } = options;
    return [
        fixedExit({ stopPct, targetR: 1.5 }),
        fixedExit({ stopPct, targetR: 2 }),
        atrExit({ mult: atrStopMult, targetR: atrTargetR, length: atrLength }),
        atrTrailingExit({ mult: trailAtrMult, length: atrLength }),
    ];
}
