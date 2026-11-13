/**
 * Trade history: BUY/SELL signals recorded as trackable trades, resolved
 * against live quotes (TP target = tp1). Persistence: data/trades.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Analysis, Quote, TradeRecord } from '../shared/types.js';

const DATA_FILE = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'data/trades.json');

function load(): TradeRecord[] {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as TradeRecord[];
  } catch {
    return []; // missing/corrupt file starts empty — never crash the API
  }
}

let trades: TradeRecord[] = load();

function save(): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(trades, null, 2));
}

/**
 * Pure: advance one trade with the latest price (Unix seconds for close time).
 * Limit/stop orders only activate once price touches entry — a gap past SL
 * counts as filled + stopped; a run to TP without touching entry stays open
 * (missed entry). TP and SL sit on opposite sides of entry, so a single price
 * never matches both.
 */
export function resolveTrade(trade: TradeRecord, price: number, nowSec: number): TradeRecord {
  if (trade.status !== 'RUNNING') return trade;
  if (!(price > 0)) return trade; // absent/zero wire price (missing lp) — never resolve
  const buy = trade.direction === 'BUY';
  const touched =
    trade.action.kind === 'BUY_STOP' || trade.action.kind === 'SELL_LIMIT'
      ? price >= trade.entry
      : price <= trade.entry;
  // ponytail: missed entries (gap/run past TP without a fill) stay RUNNING;
  // add a MISS/EXPIRE status when that case matters.
  if (!trade.filled && !touched) return trade;
  if (buy ? price >= trade.tp1 : price <= trade.tp1) {
    return { ...trade, filled: true, status: 'TP_HIT', exitPrice: trade.tp1, closedAt: nowSec };
  }
  if (buy ? price <= trade.sl : price >= trade.sl) {
    return { ...trade, filled: true, status: 'SL_HIT', exitPrice: trade.sl, closedAt: nowSec };
  }
  return trade.filled ? trade : { ...trade, filled: true };
}

/** Resolve all running trades against a price; true when any trade changed. */
export function resolveTrades(quote: Quote | null, nowSec: number): boolean {
  if (!quote) return false;
  let changed = false;
  trades = trades.map((t) => {
    const next = resolveTrade(t, quote.last, nowSec);
    if (next !== t) changed = true;
    return next;
  });
  if (changed) save();
  return changed;
}

/**
 * Record a BUY/SELL analysis as a new trade. Signals re-fire on every
 * recompute, so a same-direction trade still running blocks a new record;
 * re-entry after a close records again.
 */
export function recordSignal(analysis: Analysis, nowSec: number): TradeRecord | null {
  const { plan } = analysis;
  if (plan.verdict === 'WAIT' || plan.entry === null || plan.sl === null || plan.tp1 === null) return null;
  if (trades.some((t) => t.status === 'RUNNING' && t.direction === plan.verdict)) return null;
  const trade: TradeRecord = {
    id: randomUUID(),
    createdAt: nowSec,
    closedAt: null,
    status: 'RUNNING',
    direction: plan.verdict,
    action: plan.action,
    entry: plan.entry,
    sl: plan.sl,
    tp1: plan.tp1,
    tp2: plan.tp2,
    filled: plan.action.kind === 'MARKET',
    exitPrice: null,
    confidence: plan.confidence,
    setupType: plan.setupType,
    reasons: analysis.reasons,
  };
  trades.push(trade);
  save();
  return trade;
}

/** Newest first. */
export function listTrades(): TradeRecord[] {
  return [...trades].reverse();
}
