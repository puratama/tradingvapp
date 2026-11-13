/**
 * Market structure: swing points, trend classification, S/R level building.
 */
import type { Candle, Level, Trend } from '../../shared/types.js';
import { atr, ema, lastValue } from '../../shared/indicators.js';

export interface SwingPoints {
  /** Prices of confirmed swing highs, with their bar index. */
  highs: { i: number; price: number }[];
  lows: { i: number; price: number }[];
}

/**
 * Fractal swings over closed bars only (last `lookRight` bars cannot confirm).
 * A swing high at i requires lookLeft lower highs on each side.
 */
export function findSwings(candles: Candle[], lookLeft = 2, lookRight = 2): SwingPoints {
  const highs: { i: number; price: number }[] = [];
  const lows: { i: number; price: number }[] = [];
  const lastConfirmable = candles.length - 1 - lookRight;
  for (let i = lookLeft; i <= lastConfirmable; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookLeft; j <= i + lookRight; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ i, price: candles[i].high });
    if (isLow) lows.push({ i, price: candles[i].low });
  }
  return { highs, lows };
}

export interface TrendVerdict {
  score: number;
  trend: Trend;
}

/**
 * Trend score in [-1, 1]: EMA20/50/200 alignment, price vs EMA50,
 * and swing structure (HH/HL vs LH/LL).
 */
export function classifyTrend(candles: Candle[]): TrendVerdict {
  const closes = candles.map((c) => c.close);
  const e20 = lastValue(ema(closes, 20));
  const e50 = lastValue(ema(closes, 50));
  const e200 = lastValue(ema(closes, 200));
  const close = closes[closes.length - 1];

  const parts: number[] = [];
  if (e50 !== null) parts.push(close > e50 ? 1 : -1);
  if (e20 !== null && e50 !== null) parts.push(e20 > e50 ? 1 : -1);
  if (e50 !== null && e200 !== null) parts.push(e50 > e200 ? 1 : -1);

  const swings = findSwings(candles);
  const sh = swings.highs.slice(-2).map((s) => s.price);
  const sl = swings.lows.slice(-2).map((s) => s.price);
  if (sh.length === 2 && sl.length === 2) {
    if (sh[1] > sh[0] && sl[1] > sl[0]) parts.push(1);
    else if (sh[1] < sh[0] && sl[1] < sl[0]) parts.push(-1);
    else parts.push(0);
  }

  const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  return { score, trend: score > 0.45 ? 'UP' : score < -0.45 ? 'DOWN' : 'RANGE' };
}

const MIN_LEVEL_GAP_ATR = 0.35;

/**
 * Tradeable levels around current price: H4/H1 swing S/R (clustered),
 * round numbers, previous-day high/low.
 */
export function buildLevels(
  h4: Candle[],
  h1: Candle[],
  d1: Candle[],
  currentPrice: number,
): Level[] {
  const atrH4 = lastValue(atr(h4)) ?? 5;
  const raw: { price: number; kind: Level['kind']; label: string; strength: number }[] = [];

  for (const { candles, weight, tag } of [
    { candles: h4, weight: 3, tag: 'H4' },
    { candles: h1, weight: 2, tag: 'H1' },
  ] as const) {
    const swings = findSwings(candles, 3, 3);
    for (const s of swings.highs.slice(-4)) raw.push({ price: s.price, kind: 'resistance', label: `Swing high ${tag}`, strength: weight });
    for (const s of swings.lows.slice(-4)) raw.push({ price: s.price, kind: 'support', label: `Swing low ${tag}`, strength: weight });
  }

  // Round numbers within 2 ATR of price; multiples of 50 are stronger.
  const window = 2 * atrH4;
  const start = Math.floor((currentPrice - window) / 10) * 10;
  for (let p = start; p <= currentPrice + window; p += 10) {
    if (p === 0) continue;
    const major = p % 50 === 0;
    raw.push({
      price: p,
      kind: 'round',
      label: `Round number ${p.toFixed(0)}`,
      strength: major ? 2 : 1,
    });
  }

  // Previous day high/low from completed D1 bars (skip the forming bar).
  const done = d1.slice(0, -1);
  const prev = done[done.length - 1];
  if (prev) {
    raw.push({ price: prev.high, kind: 'pdh', label: 'Previous day high', strength: 2 });
    raw.push({ price: prev.low, kind: 'pdl', label: 'Previous day low', strength: 2 });
  }

  // Cluster: keep the strongest level per price bucket.
  const gap = Math.max(0.1, atrH4 * MIN_LEVEL_GAP_ATR);
  raw.sort((a, b) => a.price - b.price || b.strength - a.strength);
  const kept: Level[] = [];
  for (const lv of raw) {
    const near = kept.find((k) => Math.abs(k.price - lv.price) < gap);
    if (near) {
      if (lv.strength > near.strength) {
        near.price = lv.price;
        near.kind = lv.kind;
        near.label = lv.label;
        near.strength = lv.strength;
      }
      continue;
    }
    kept.push({ ...lv });
  }

  // Keep levels within 3 ATR of price (tradeable horizon).
  return kept
    .filter((lv) => Math.abs(lv.price - currentPrice) <= 3 * atrH4)
    .sort((a, b) => a.price - b.price);
}
