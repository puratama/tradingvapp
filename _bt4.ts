/**
 * Temporary scalp calibration probe (not committed).
 * Base: XAUUSD.txt M1 2003-2026, all TFs aggregated from one feed.
 * Knobs (env): SC_TP, SC_LO, SC_HI (clamp), SC_MIN, COST_MAX, HOURS "7-20" UTC.
 * Run: npx tsx _bt4.ts scalp|swing [fromIso]
 */
import fs from 'node:fs';
import type { Candle, TF, TfSnapshot, Level, Pattern } from './shared/types.js';
import { TIMEFRAMES } from './shared/types.js';
import { atr, ema, lastValue, macd, prevValue, rsi } from './shared/indicators.js';
import { buildLevels, classifyTrend } from './server/analysis/structure.js';
import { detectPatterns } from './server/analysis/patterns.js';
import { planPrices, GRIDS, SCALP_RULES, SWING_RULES } from './server/analysis/signal.js';
import type { Style } from './server/analysis/signal.js';

const SC_TP = Number(process.env.SC_TP ?? '0');
const SC_LO = Number(process.env.SC_LO ?? '0');
const SC_MIN = Number(process.env.SC_MIN ?? '0');
const COST_MAX = Number(process.env.COST_MAX ?? '99');
const HOURS = (process.env.HOURS ?? '0-23').split('-').map(Number);
if (SC_TP) {
  GRIDS.scalp.grid.tp1Risk = SC_TP;
  GRIDS.scalp.grid.tp2Risk = SC_TP * 1.6;
}
if (SC_LO) GRIDS.scalp.grid.clamp = [SC_LO, Number(process.env.SC_HI ?? SC_LO * 2)];
if (SC_MIN) SCALP_RULES.minPoints = SC_MIN;

const SPREAD = 0.30;
const FROM_YEAR = 2014;

interface Bar extends Candle {
  spread: number;
}

const m1: Bar[] = [];
{
  const rows = fs.readFileSync('C:/Users/RIZKY/Documents/MT5 DATA/XAUUSD/XAUUSD.txt', 'utf8').split(/\r?\n/);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 30) continue;
    const dt = row.slice(7, 15);
    const tm = row.slice(16, 22);
    if (Number(dt.slice(0, 4)) < FROM_YEAR) continue;
    const time = Math.floor(Date.parse(`${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${tm.slice(0, 2)}:${tm.slice(2, 4)}:${tm.slice(4, 6)}Z`) / 1000);
    if (!Number.isFinite(time)) continue;
    const p = row.slice(23).split(',');
    m1.push({ time, open: +p[0], high: +p[1], low: +p[2], close: +p[3], volume: +p[4], spread: SPREAD });
  }
}

function aggregate(sec: number): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let key = 0;
  for (const b of m1) {
    const k = Math.floor(b.time / sec) * sec;
    if (!cur || k !== key) {
      cur = { time: k, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, spread: b.spread };
      out.push(cur);
      key = k;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  return out;
}

const SERIES: Record<TF, Bar[]> = {
  M1: m1,
  M5: aggregate(300),
  M15: aggregate(900),
  H1: aggregate(3600),
  H4: aggregate(14400),
  D1: aggregate(86400),
};

function lastIndexAt(arr: Bar[], t: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

const WINDOW = 300;
const TF_WEIGHT: Record<TF, number> = { D1: 3, H4: 3, H1: 2, M15: 1, M5: 1, M1: 0 };
const SCALP_WEIGHT: Record<TF, number> = { D1: 1, H4: 1, H1: 2, M15: 2, M5: 3, M1: 1 };

function snapshot(candles: Bar[], tf: TF): TfSnapshot {
  const closes = candles.map((c) => c.close);
  const { score, trend } = classifyTrend(candles);
  return {
    tf,
    trend,
    trendScore: score,
    close: closes[closes.length - 1],
    ema20: lastValue(ema(closes, 20)) ?? closes[closes.length - 1],
    ema50: lastValue(ema(closes, 50)) ?? closes[closes.length - 1],
    ema200: lastValue(ema(closes, 200)) ?? closes[closes.length - 1],
    rsi: lastValue(rsi(closes)) ?? 50,
    macdHist: lastValue(macd(closes).hist) ?? 0,
    atr: lastValue(atr(candles)) ?? 0,
  };
}

interface Signal {
  time: number;
  style: Style;
  verdict: 'BUY' | 'SELL';
  points: number;
  entry: number;
  sl: number;
  tp1: number;
  basisTf: TF;
  spread: number;
}

function decide(closesAt: Record<TF, Bar[]>, style: Style, t: number): Signal | null {
  const mtf = TIMEFRAMES.map((tf) => snapshot(closesAt[tf], tf));
  const snap = Object.fromEntries(mtf.map((s) => [s.tf, s])) as Record<TF, TfSnapshot>;
  const weights = style === 'scalp' ? SCALP_WEIGHT : TF_WEIGHT;
  const bias =
    mtf.reduce((acc, s) => acc + s.trendScore * weights[s.tf], 0) /
    mtf.reduce((acc, s) => acc + weights[s.tf], 0);
  const direction: 'BUY' | 'SELL' | null = bias >= 0.25 ? 'BUY' : bias <= -0.25 ? 'SELL' : null;
  if (!direction) return null;

  const up = direction === 'BUY';
  const priceNow = snap.H1.close;
  let points = 0;
  const basisTf = GRIDS[style].basisTf;
  const mom = snap[basisTf];
  const rules = style === 'scalp' ? SCALP_RULES : SWING_RULES;

  const h4Aligned = up ? snap.H4.trend === 'UP' : snap.H4.trend === 'DOWN';
  const h1Aligned = up ? snap.H1.trend === 'UP' : snap.H1.trend === 'DOWN';
  points += h4Aligned && h1Aligned ? 2 : h4Aligned || h1Aligned ? 1 : -1;
  points += up ? (snap.D1.trend !== 'DOWN' ? 1 : -1) : snap.D1.trend !== 'UP' ? 1 : -1;

  const [lo, hi] = up ? rules.rsi.buy : rules.rsi.sell;
  points += mom.rsi >= lo && mom.rsi <= hi ? 1 : -1;

  const hist = macd(closesAt[basisTf].map((c) => c.close)).hist;
  const rising = (lastValue(hist) ?? 0) > (prevValue(hist) ?? 0);
  points += up === rising ? 1 : -1;

  const distToEma = up ? priceNow - mom.ema20 : mom.ema20 - priceNow;
  const atrEntry = Math.max(mom.atr, 0.05);
  if (distToEma <= rules.nearEma * atrEntry) points += 1;
  else if (distToEma > rules.chaseEma * atrEntry) points -= 1;

  const patterns: Pattern[] = [...detectPatterns(closesAt.M5, 'M5'), ...detectPatterns(closesAt.M15, 'M15')];
  if (patterns.some((p) => (up ? p.direction === 'bull' : p.direction === 'bear'))) points += 1;

  const levels: Level[] =
    style === 'scalp'
      ? buildLevels(closesAt.H1, closesAt.M15, closesAt.H4, priceNow)
      : buildLevels(closesAt.H4, closesAt.H1, closesAt.D1, priceNow);
  const nearby = levels
    .filter((lv) => Math.abs(lv.price - priceNow) <= 0.5 * atrEntry && (up ? lv.price < priceNow : lv.price > priceNow))
    .sort((a, b) => Math.abs(a.price - priceNow) - Math.abs(b.price - priceNow))[0];
  if (nearby) points += 1;

  if (points < rules.minPoints) return null;

  const plan = planPrices(direction, mom, closesAt[basisTf], GRIDS[style].grid);
  return { time: t, style, verdict: direction, points, entry: plan.entry!, sl: plan.sl!, tp1: plan.tp1!, basisTf, spread: SPREAD };
}

interface Outcome {
  time: number;
  status: 'TP1' | 'SL' | 'OPEN' | 'EXPIRED' | 'AMBIG';
  pnlR: number;
  costR: number;
}

function resolve(sig: Signal): Outcome {
  const buy = sig.verdict === 'BUY';
  const ttl = sig.style === 'scalp' ? 600 : 3600;
  const risk = Math.abs(sig.entry - sig.sl);
  const costR = sig.spread / risk;
  if (costR > COST_MAX) return { time: sig.time, status: 'EXPIRED', pnlR: 0, costR: 0 };
  const start = lastIndexAt(m1, sig.time) + 1;
  let filled = false;

  for (let i = start; i < m1.length; i++) {
    const b = m1[i];
    if (!filled && b.time - sig.time > ttl) return { time: sig.time, status: 'EXPIRED', pnlR: 0, costR: 0 };
    if (!filled) {
      if (!(buy ? b.low <= sig.entry : b.high >= sig.entry)) continue;
      filled = true;
    }
    const tp = buy ? b.high >= sig.tp1 : b.low <= sig.tp1;
    const sl = buy ? b.low <= sig.sl : b.high >= sig.sl;
    if (sl && tp) return { time: sig.time, status: 'AMBIG', pnlR: -1, costR };
    if (sl) return { time: sig.time, status: 'SL', pnlR: -1, costR };
    if (tp) return { time: sig.time, status: 'TP1', pnlR: GRIDS[sig.style].grid.tp1Risk, costR };
  }
  return { time: sig.time, status: 'OPEN', pnlR: 0, costR: 0 };
}

function run(style: Style, fromIso: string): void {
  const step = style === 'scalp' ? 5 * 60 : 60 * 60;
  const basis: TF = style === 'scalp' ? 'M5' : 'H1';
  const from = Math.floor(Date.parse(`${fromIso}T00:00:00Z`) / 1000);
  const outcomes: Outcome[] = [];
  let lastSignal = 0;

  for (let t = from; t < m1.at(-1)!.time; t += step) {
    const hour = new Date(t * 1000).getUTCHours();
    if (hour < HOURS[0] || hour > HOURS[1]) continue;
    const idx = TIMEFRAMES.map((tf) => lastIndexAt(SERIES[tf], t));
    if (idx.some((i) => i < 210)) continue;
    const closesAt = Object.fromEntries(
      TIMEFRAMES.map((tf, k) => [tf, SERIES[tf].slice(Math.max(0, idx[k] - WINDOW + 1), idx[k] + 1)]),
    ) as Record<TF, Bar[]>;
    const sig = decide(closesAt, style, closesAt[basis].at(-1)!.time);
    if (!sig) continue;
    if (lastSignal && sig.time - lastSignal < (style === 'scalp' ? 600 : 3600)) continue;
    lastSignal = sig.time;
    outcomes.push(resolve(sig));
  }

  const closed = outcomes.filter((o) => o.status === 'TP1' || o.status === 'SL' || o.status === 'AMBIG');
  const wins = closed.filter((o) => o.status === 'TP1').length;
  const netR = closed.reduce((a, o) => a + o.pnlR - o.costR, 0);
  const avgCost = closed.reduce((a, o) => a + o.costR, 0) / Math.max(1, closed.length);
  const byYear = new Map<string, { n: number; r: number }>();
  for (const o of closed) {
    const k = new Date(o.time * 1000).toISOString().slice(0, 4);
    const cur = byYear.get(k) ?? { n: 0, r: 0 };
    cur.n += 1;
    cur.r += o.pnlR - o.costR;
    byYear.set(k, cur);
  }

  console.log(`\n=== ${style} ${fromIso} tp${GRIDS[style].grid.tp1Risk} clamp${JSON.stringify(GRIDS[style].grid.clamp)} minPts${style === 'scalp' ? SCALP_RULES.minPoints : SWING_RULES.minPoints} cost<${COST_MAX} hours${HOURS[0]}-${HOURS[1]}`);
  console.log(`closed ${closed.length}, win ${(wins / Math.max(1, closed.length) * 100).toFixed(1)}%, grossR ${(netR / Math.max(1, closed.length) + avgCost).toFixed(3)}, avgCost ${avgCost.toFixed(3)}, netR ${(netR / Math.max(1, closed.length)).toFixed(3)}`);
  let streak = 0;
  let maxStreak = 0;
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const o of closed) {
    streak = o.pnlR > 0 ? 0 : streak + 1;
    maxStreak = Math.max(maxStreak, streak);
    equity += o.pnlR - o.costR;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }
  console.log(`maxLosingStreak ${maxStreak}   maxDD ${maxDD.toFixed(1)}R   total ${equity.toFixed(1)}R`);
  for (const [k, v] of [...byYear.entries()].sort()) console.log(`  ${k}  n=${String(v.n).padStart(4)}  netR ${(v.r / v.n).toFixed(3)}`);
}

run((process.argv[2] ?? 'scalp') as Style, process.argv[3] ?? '2024-01-01');
process.exit(0);
