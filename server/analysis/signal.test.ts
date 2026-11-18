/**
 * Self-check for scalp vs swing stop geometry (pure).
 * Run: npx tsx server/analysis/signal.test.ts
 */
import assert from 'node:assert/strict';
import { planPrices } from './signal.js';
import { GRIDS } from './signal.js';
import type { Candle, TfSnapshot } from '../../shared/types.js';

function snapshot(tf: TfSnapshot['tf'], atr: number): TfSnapshot {
  return { tf, trend: 'UP', trendScore: 0.6, close: 4000, ema20: 3990, ema50: 3980, ema200: 3950, rsi: 58, macdHist: 0.4, atr };
}

/** Mirror-symmetric bars: extremes at 3990 and 4010, so BUY and SELL stop
 *  distances are comparable. */
function bars(): Candle[] {
  return Array.from({ length: 31 }, (_, i) => ({
    time: i * 60,
    open: 4000,
    high: i === 18 ? 4010 : 4002,
    low: i === 18 ? 3990 : 3998,
    close: 4000,
    volume: 1,
  }));
}

const priceNow = 4000;
const swing = planPrices('BUY', snapshot('H1', 20), bars(), GRIDS.swing.grid);
const scalp = planPrices('BUY', snapshot('M5', 2), bars(), GRIDS.scalp.grid);

// Scalp stops live inside its own ATR band, not the swing one.
assert.equal(swing.basisTf, 'H1');
assert.equal(scalp.basisTf, 'M5');
const scalpStop = scalp.stopDistance ?? NaN;
const swingStop = swing.stopDistance ?? NaN;
const [scalpLo, scalpHi] = GRIDS.scalp.grid.clamp;
assert.ok(scalpStop >= scalpLo * 2 - 0.01, `scalp stop too tight: ${scalpStop}`);
assert.ok(scalpStop <= scalpHi * 2 + 0.01, `scalp stop too wide: ${scalpStop}`);

// RR is the grid's, and targets follow from it — never a constant 1.5/2.5.
assert.equal(scalp.rr1, 1);
assert.equal(scalp.rr2, 1.6);
assert.equal(Number((scalp.tp1! - scalp.entry!).toFixed(2)), scalpStop);
assert.equal(Number((scalp.tp2! - scalp.entry!).toFixed(2)), Number((1.6 * scalpStop).toFixed(2)));

// Direction invariant: BUY stops below entry, targets above.
assert.ok(scalp.sl! < scalp.entry! && scalp.tp1! > scalp.entry! && scalp.tp2! > scalp.tp1!);

// SELL mirrors the geometry (entry sits at/near price because the pullback
// branch is directional, so only the stop/target invariants are comparable).
const sell = planPrices('SELL', snapshot('M5', 2), bars(), GRIDS.scalp.grid);
assert.ok(sell.sl! > sell.entry! && sell.tp1! < sell.entry! && sell.tp2! < sell.tp1!);
assert.ok(sell.stopDistance! >= scalpLo * 2 - 0.01 && sell.stopDistance! <= scalpHi * 2 + 0.01);
assert.equal(Number((sell.entry! - sell.tp1!).toFixed(2)), sell.stopDistance);

console.log('signal.test.ts: all assertions passed');
