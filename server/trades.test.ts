/**
 * Self-check for resolveTrade (pure). Run: npx tsx server/trades.test.ts
 * Throws on failure; prints one line on success.
 */
import assert from 'node:assert/strict';
import { resolveTrade } from './trades.js';
import type { TradeRecord } from '../shared/types.js';

function trade(over: Partial<TradeRecord>): TradeRecord {
  return {
    id: 't1',
    createdAt: 1_000,
    closedAt: null,
    status: 'RUNNING',
    direction: 'BUY',
    action: { kind: 'MARKET', label: 'Market', note: '' },
    entry: 4000,
    sl: 3990,
    tp1: 4020,
    tp2: null,
    filled: true,
    exitPrice: null,
    confidence: 60,
    setupType: 'test',
    reasons: [],
    ...over,
  };
}

const t = trade({});
assert.equal(resolveTrade(t, 4005, 2_000), t); // between levels → unchanged
assert.deepEqual(resolveTrade(t, 4020, 2_000), { ...t, status: 'TP_HIT', exitPrice: 4020, closedAt: 2_000 });
assert.deepEqual(resolveTrade(t, 3989.9, 2_000), { ...t, status: 'SL_HIT', exitPrice: 3990, closedAt: 2_000 });

// Limit BUY (entry below market): WAITING until price touches entry.
const limit = trade({ action: { kind: 'BUY_LIMIT', label: 'Buy Limit', note: '' }, filled: false, status: 'WAITING' });
assert.equal(resolveTrade(limit, 4025, 2_000), limit); // ran to TP without a fill → still open (missed)
assert.deepEqual(resolveTrade(limit, 3998, 2_000), { ...limit, filled: true, status: 'RUNNING' }); // touch entry → filled + running
assert.deepEqual(resolveTrade(limit, 3985, 2_000), {
  ...limit,
  filled: true,
  status: 'SL_HIT',
  exitPrice: 3990,
  closedAt: 2_000,
}); // gap through SL → filled + stopped

// Legacy unfilled RUNNING rows heal to WAITING on the next tick.
const missed = trade({ action: { kind: 'BUY_LIMIT', label: 'Buy Limit', note: '' }, filled: false });
assert.deepEqual(resolveTrade(missed, 4025, 2_000), { ...missed, status: 'WAITING' });

// Unfilled orders expire after WAITING_TTL_SEC, even with no usable price.
const ttl = 60 * 60;
assert.equal(resolveTrade(limit, 4025, 1_000 + ttl - 1), limit); // just under the TTL → waiting
assert.deepEqual(resolveTrade(limit, 4025, 1_000 + ttl), { ...limit, status: 'EXPIRED', closedAt: 1_000 + ttl });
assert.deepEqual(resolveTrade(limit, 0, 1_000 + ttl), { ...limit, status: 'EXPIRED', closedAt: 1_000 + ttl }); // dead feed still expires
assert.equal(resolveTrade(t, 4005, 1_000 + ttl * 24), t); // filled trades never expire

// SELL mirrors: TP below entry, SL above.
const sell = trade({ direction: 'SELL', sl: 4010, tp1: 3980 });
assert.deepEqual(resolveTrade(sell, 3980, 2_000), { ...sell, status: 'TP_HIT', exitPrice: 3980, closedAt: 2_000 });
assert.deepEqual(resolveTrade(sell, 4010, 2_000), { ...sell, status: 'SL_HIT', exitPrice: 4010, closedAt: 2_000 });

// Invalid wire prices (absent/zero lp) must never fill or resolve a trade.
assert.equal(resolveTrade(t, 0, 2_000), t);
assert.equal(resolveTrade(t, Number.NaN, 2_000), t);
assert.equal(resolveTrade(sell, 0, 2_000), sell); // regression: false TP_HIT on SELL
assert.equal(resolveTrade(limit, 0, 2_000), limit); // bogus price must not fake a fill

// Closed trades never change.
const closed = trade({ status: 'TP_HIT', closedAt: 1_500, exitPrice: 4020 });
assert.equal(resolveTrade(closed, 1, 9_000), closed);

console.error('trades.test.ts: all assertions passed');
