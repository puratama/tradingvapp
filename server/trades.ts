/**
 * Trade history: BUY/SELL signals recorded as trackable trades, resolved
 * against live quotes (TP target = tp1). Persistence: PostgreSQL via `pg`.
 * Connection comes from the standard PG* variables, loaded from .env by
 * server/env.ts (see .env.example).
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Analysis, PlanAction, Quote, TradeRecord } from '../shared/types.js';

/** Unfilled orders expire after one hour — otherwise a pending limit the price
 *  never reaches blocks every same-direction signal forever. */
export const WAITING_TTL_SEC = 60 * 60;

const OPEN_STATUSES = "('WAITING', 'RUNNING')";

export interface TradeRow {
  id: string;
  created_at: string | number;
  closed_at: string | number | null;
  status: string;
  direction: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  filled: boolean | number;
  exit_price: number | null;
  confidence: number;
  setup_type: string;
  action: string;
  reasons: string;
}

/** pg returns BIGINT columns as strings — normalise to seconds. */
function toSec(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function toRecord(r: TradeRow): TradeRecord {
  return {
    id: r.id,
    createdAt: toSec(r.created_at),
    closedAt: r.closed_at === null ? null : toSec(r.closed_at),
    status: r.status as TradeRecord['status'],
    direction: r.direction as TradeRecord['direction'],
    action: JSON.parse(r.action) as PlanAction,
    entry: Number(r.entry),
    sl: Number(r.sl),
    tp1: Number(r.tp1),
    tp2: r.tp2 === null ? null : Number(r.tp2),
    filled: r.filled === true || Number(r.filled) === 1,
    exitPrice: r.exit_price === null ? null : Number(r.exit_price),
    confidence: Number(r.confidence),
    setupType: r.setup_type,
    reasons: JSON.parse(r.reasons) as string[],
  };
}

const pool = new pg.Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database: process.env.PGDATABASE ?? 'tradingvapp',
});
pool.on('error', (err) => console.error('[trades] pool error:', err.message));

let ready: Promise<void> | null = null;

/** Create the schema once per process. */
function ensureSchema(): Promise<void> {
  ready ??= pool
    .query(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        created_at BIGINT NOT NULL,
        closed_at BIGINT,
        status TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry DOUBLE PRECISION NOT NULL,
        sl DOUBLE PRECISION NOT NULL,
        tp1 DOUBLE PRECISION NOT NULL,
        tp2 DOUBLE PRECISION,
        filled BOOLEAN NOT NULL,
        exit_price DOUBLE PRECISION,
        confidence DOUBLE PRECISION NOT NULL,
        setup_type TEXT NOT NULL,
        action TEXT NOT NULL,
        reasons TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS trades_status_dir ON trades (status, direction);
    `)
    .then(() => undefined)
    .catch((err) => {
      ready = null; // let the next call retry instead of caching a dead promise
      throw err;
    });
  return ready;
}

async function persist(t: TradeRecord): Promise<void> {
  await pool.query(
    `INSERT INTO trades (id, created_at, closed_at, status, direction, entry, sl, tp1, tp2,
                         filled, exit_price, confidence, setup_type, action, reasons)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO UPDATE SET
       closed_at = EXCLUDED.closed_at,
       status = EXCLUDED.status,
       filled = EXCLUDED.filled,
       exit_price = EXCLUDED.exit_price`,
    [
      t.id,
      t.createdAt,
      t.closedAt,
      t.status,
      t.direction,
      t.entry,
      t.sl,
      t.tp1,
      t.tp2,
      t.filled,
      t.exitPrice,
      t.confidence,
      t.setupType,
      JSON.stringify(t.action),
      JSON.stringify(t.reasons),
    ],
  );
}

/**
 * Pure: advance one trade with the latest price (Unix seconds for close time).
 * Unfilled orders expire after WAITING_TTL_SEC; until then they stay WAITING
 * and only turn RUNNING once price touches entry — a gap past SL counts as
 * filled + stopped. Expiry is checked before the price guard so a dead feed
 * cannot keep a lapsed order alive. TP and SL sit on opposite sides of entry,
 * so a single price never matches both.
 */
export function resolveTrade(trade: TradeRecord, price: number, nowSec: number): TradeRecord {
  if (trade.status !== 'WAITING' && trade.status !== 'RUNNING') return trade;
  if (!trade.filled && nowSec - trade.createdAt >= WAITING_TTL_SEC) {
    return { ...trade, status: 'EXPIRED', closedAt: nowSec };
  }
  if (!(price > 0)) return trade; // absent/zero wire price (missing lp) — never resolve
  const buy = trade.direction === 'BUY';
  const touched =
    trade.action.kind === 'BUY_STOP' || trade.action.kind === 'SELL_LIMIT'
      ? price >= trade.entry
      : price <= trade.entry;
  // Price still away from entry: stay (or heal to) WAITING until the TTL lapses.
  if (!trade.filled && !touched) return trade.status === 'WAITING' ? trade : { ...trade, status: 'WAITING' };
  if (buy ? price >= trade.tp1 : price <= trade.tp1) {
    return { ...trade, filled: true, status: 'TP_HIT', exitPrice: trade.tp1, closedAt: nowSec };
  }
  if (buy ? price <= trade.sl : price >= trade.sl) {
    return { ...trade, filled: true, status: 'SL_HIT', exitPrice: trade.sl, closedAt: nowSec };
  }
  return trade.filled ? trade : { ...trade, filled: true, status: 'RUNNING' };
}

/** Resolve all open trades against a price (null price still advances expiry);
 *  true when any trade changed. */
export async function resolveTrades(quote: Quote | null, nowSec: number): Promise<boolean> {
  const price = quote?.last ?? 0;
  await ensureSchema();
  const { rows } = await pool.query<TradeRow>(`SELECT * FROM trades WHERE status IN ${OPEN_STATUSES}`);
  let changed = false;
  for (const row of rows) {
    const trade = toRecord(row);
    const next = resolveTrade(trade, price, nowSec);
    if (next === trade) continue;
    await persist(next);
    changed = true;
  }
  return changed;
}

/**
 * Record a BUY/SELL analysis as a new trade. Signals re-fire on every
 * recompute, so a same-direction trade still open (WAITING or RUNNING) blocks
 * a new record; re-entry after a close records again.
 */
export async function recordSignal(analysis: Analysis, nowSec: number): Promise<TradeRecord | null> {
  const { plan } = analysis;
  if (plan.verdict === 'WAIT' || plan.entry === null || plan.sl === null || plan.tp1 === null) return null;
  await ensureSchema();
  const open = await pool.query(
    `SELECT 1 FROM trades WHERE status IN ${OPEN_STATUSES} AND direction = $1 LIMIT 1`,
    [plan.verdict],
  );
  if (open.rowCount) return null;
  const trade: TradeRecord = {
    id: randomUUID(),
    createdAt: nowSec,
    closedAt: null,
    status: plan.action.kind === 'MARKET' ? 'RUNNING' : 'WAITING',
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
  await persist(trade);
  return trade;
}

/** Newest first. */
export async function listTrades(): Promise<TradeRecord[]> {
  await ensureSchema();
  const { rows } = await pool.query<TradeRow>('SELECT * FROM trades ORDER BY created_at DESC');
  return rows.map(toRecord);
}
