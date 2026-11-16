/**
 * Trade history: BUY/SELL signals recorded as trackable trades, resolved
 * against live quotes (TP target = tp1). Persistence: PostgreSQL via Prisma
 * (schema: prisma/schema.prisma, model Trade → table `trades`). Connection via
 * DATABASE_URL from .env, loaded by server/env.ts (see .env.example).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Analysis, PlanAction, Quote, TradeRecord } from '../shared/types.js';

/** Unfilled orders expire after one hour — otherwise a pending limit the price
 *  never reaches blocks every same-direction signal forever. */
export const WAITING_TTL_SEC = 60 * 60;

const OPEN_STATUSES = ['WAITING', 'RUNNING'];

/** Wire shape of the Prisma `Trade` model (BIGINT columns come back as bigint). */
interface RawTrade {
  id: string;
  createdAt: bigint;
  closedAt: bigint | null;
  status: string;
  direction: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  filled: boolean;
  exitPrice: number | null;
  confidence: number;
  setupType: string;
  action: string;
  reasons: string;
}

/** BIGINT columns arrive as bigint — normalise to seconds. */
function toSec(v: bigint | number | null): number {
  return v === null ? 0 : Number(v);
}

function toRecord(r: RawTrade): TradeRecord {
  return {
    id: r.id,
    createdAt: toSec(r.createdAt),
    closedAt: toSec(r.closedAt),
    status: r.status as TradeRecord['status'],
    direction: r.direction as TradeRecord['direction'],
    action: JSON.parse(r.action) as PlanAction,
    entry: Number(r.entry),
    sl: Number(r.sl),
    tp1: Number(r.tp1),
    tp2: r.tp2 === null ? null : Number(r.tp2),
    filled: r.filled === true,
    exitPrice: r.exitPrice === null ? null : Number(r.exitPrice),
    confidence: Number(r.confidence),
    setupType: r.setupType,
    reasons: JSON.parse(r.reasons) as string[],
  };
}

// Lazy: the self-check (server/trades.test.ts) imports the pure resolveTrade
// and must run without DATABASE_URL or a live DB.
let client: PrismaClient | null = null;
function db(): PrismaClient {
  return (client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }));
}

async function persist(t: TradeRecord): Promise<void> {
  await db().trade.upsert({
    where: { id: t.id },
    create: {
      id: t.id,
      createdAt: t.createdAt,
      closedAt: t.closedAt,
      status: t.status,
      direction: t.direction,
      entry: t.entry,
      sl: t.sl,
      tp1: t.tp1,
      tp2: t.tp2,
      filled: t.filled,
      exitPrice: t.exitPrice,
      confidence: t.confidence,
      setupType: t.setupType,
      action: JSON.stringify(t.action),
      reasons: JSON.stringify(t.reasons),
    },
    update: { closedAt: t.closedAt, status: t.status, filled: t.filled, exitPrice: t.exitPrice },
  });
}

/**
 * Pure: advance one trade with the latest price (Unix seconds for close time).
 * ORDERING INVARIANTS — cash-settled XAUUSD, broker feed, no OHLC:
 *  - an expired unfilled order becomes EXPIRED before any price check
 *  - an invalid price (absent or <= 0) resolves nothing but still expires
 *  - a filled position that takes both SL and TP on the same tick takes SL
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
  const rows = (await db().trade.findMany({
    where: { status: { in: OPEN_STATUSES } },
  })) as RawTrade[];
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
  const open = await db().trade.findFirst({
    where: { status: { in: OPEN_STATUSES }, direction: plan.verdict },
    select: { id: true },
  });
  if (open) return null;
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
  const rows = (await db().trade.findMany({ orderBy: { createdAt: 'desc' } })) as RawTrade[];
  return rows.map(toRecord);
}
