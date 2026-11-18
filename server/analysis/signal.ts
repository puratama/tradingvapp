/**
 * XAUUSD entry decision engine.
 *
 * Multi-timeframe confluence: weighted trend bias (D1:H4:H1:M15 = 3:3:2:1),
 * momentum, pullback quality, candle triggers, TradingView ratings and a
 * news gate. Produces a trade plan (entry/SL/TP on ATR) with explainable
 * reasons and warnings in Indonesian.
 */
import type {
  Analysis,
  Candle,
  EntryStyle,
  Level,
  NewsEvent,
  Pattern,
  PlanAction,
  Quote,
  TF,
  TradePlan,
  TfSnapshot,
} from '../../shared/types.js';
import { TIMEFRAMES } from '../../shared/types.js';
import { atr, ema, lastValue, macd, prevValue, rsi } from '../../shared/indicators.js';
import { buildLevels, classifyTrend } from './structure.js';
import { detectPatterns } from './patterns.js';
import { assessNewsRisk } from '../news/enrich.js';

const TF_WEIGHT: Record<TF, number> = { D1: 3, H4: 3, H1: 2, M15: 1, M5: 1, M1: 0 };
/** Scalp weights: the entry timeframes dominate, D1/M1 only colour the bias. */
const SCALP_WEIGHT: Record<TF, number> = { D1: 1, H4: 1, H1: 2, M15: 2, M5: 3, M1: 1 };
const ENTRY_TF: TF = 'H1';

/** Confluence rules that must follow the trade's own timeframe. Sizing every
 *  scalp judgement off H1 ATR mis-scales both the pullback band and the level
 *  proximity by ~4x (backtested on MT5 M1 2026: see the sweep in README). */
export interface SignalRules {
  /** RSI band that counts as healthy momentum for the direction. */
  rsi: { buy: [number, number]; sell: [number, number] };
  /** Distance from EMA20 (in own-ATR) that still counts as a pullback zone. */
  nearEma: number;
  /** Beyond this many own-ATRs the entry is chasing. */
  chaseEma: number;
  /** Winner needs at least this many confluence points (3 = clean, 2 = moderate). */
  minPoints: number;
}

export const SWING_RULES: SignalRules = { rsi: { buy: [45, 68], sell: [32, 55] }, nearEma: 0.75, chaseEma: 2, minPoints: 6 };
export const SCALP_RULES: SignalRules = { rsi: { buy: [40, 72], sell: [28, 60] }, nearEma: 1, chaseEma: 2.5, minPoints: 6 };

export interface SignalInput {
  symbol: string;
  quote: Quote | null;
  candles: Record<TF, Candle[]>;
  /** TradingView aggregate rating [-2..2] per timeframe, null if unavailable. */
  tvRatings: Record<TF, number | null>;
  events: NewsEvent[];
  /** Trade style override; defaults to ENTRY_STYLE env (swing unless 'scalp'). */
  style?: Style;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function buildSnapshot(candles: Candle[], tf: TF): TfSnapshot {
  const closes = candles.map((c) => c.close);
  const hist = macd(closes).hist;
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
    macdHist: lastValue(hist) ?? 0,
    atr: lastValue(atr(candles)) ?? 0,
  };
}

function trendWord(t: TfSnapshot['trend']): string {
  return t === 'UP' ? 'naik' : t === 'DOWN' ? 'turun' : 'ranging';
}

interface ScoreContext {
  points: number;
  reasons: string[];
  warnings: string[];
}

function addPoint(ctx: ScoreContext, points: number, reason: string): void {
  ctx.points += points;
  ctx.reasons.push(reason);
}

function addWarn(ctx: ScoreContext, points: number, warning: string): void {
  ctx.points += points;
  ctx.warnings.push(warning);
}

/** Order-type instruction derived from direction and entry vs current price. */
function describeAction(direction: 'BUY' | 'SELL', entry: number, priceNow: number): PlanAction {
  // Entries at the reference price execute at market; limit/stop entries are at
  // least 0.6 ATR (>= 0.06) away from it.
  if (Math.abs(entry - priceNow) < 0.02) {
    return {
      kind: 'MARKET',
      label: 'Market Order',
      note:
        direction === 'BUY'
          ? 'Eksekusi beli langsung di harga berjalan (market order), tanpa menunggu level tertentu — pasang SL dan TP segera setelah posisi terbuka.'
          : 'Eksekusi jual langsung di harga berjalan (market order), tanpa menunggu level tertentu — pasang SL dan TP segera setelah posisi terbuka.',
    };
  }
  if (direction === 'BUY') {
    return entry < priceNow
      ? {
          kind: 'BUY_LIMIT',
          label: 'Buy Limit',
          note: 'Order beli tertunda di level ENTRY (di bawah harga berjalan) — terisi otomatis saat harga turun menyentuh ENTRY; cocok untuk masuk saat pullback.',
        }
      : {
          kind: 'BUY_STOP',
          label: 'Buy Stop',
          note: 'Order beli tertunda di level ENTRY (di atas harga berjalan) — terisi otomatis saat harga naik menembus ENTRY; cocok untuk menangkap breakout / lanjutan tren.',
        };
  }
  return entry > priceNow
    ? {
        kind: 'SELL_LIMIT',
        label: 'Sell Limit',
        note: 'Order jual tertunda di level ENTRY (di atas harga berjalan) — terisi otomatis saat harga naik menyentuh ENTRY; cocok untuk menjual di area resistance.',
      }
    : {
        kind: 'SELL_STOP',
        label: 'Sell Stop',
        note: 'Order jual tertunda di level ENTRY (di bawah harga berjalan) — terisi otomatis saat harga turun menembus ENTRY; cocok untuk menangkap breakdown / lanjutan tren.',
      };
}

/** Stop/target geometry per trade style. Swing keeps the original H1 grid. */
interface PlanGrid {
  /** Buffer beyond the swing extreme, in basis-TF ATRs. */
  buffer: number;
  /** Minimum stop distance beyond the structural stop, in ATRs. */
  minStop: number;
  /** Hard clamp of the final stop distance, in ATRs. */
  clamp: [number, number];
  tp1Risk: number;
  tp2Risk: number;
}

/** Trade style lives in shared types so the client toggle uses the same union. */
export type Style = EntryStyle;

/** Calibrated on MT5 M1/M5/H1 (Jan 2025 – Nov 2026) with spread charged per
 *  trade: TP1 at 1.5R beats 2.5R for swing, and scalp only turns positive with
 *  ATR-sized stops clamped at [1.5, 4] plus >=6 confluence points. */
export const GRIDS: Record<Style, { basisTf: TF; grid: PlanGrid }> = {
  swing: { basisTf: 'H1', grid: { buffer: 0.15, minStop: 1.2, clamp: [1, 2.5], tp1Risk: 1.5, tp2Risk: 2.5 } },
  scalp: { basisTf: 'M5', grid: { buffer: 0.15, minStop: 1.2, clamp: [1.5, 4], tp1Risk: 1, tp2Risk: 1.6 } },
};

/** Exported for the pure self-check (server/analysis/signal.test.ts). */
export function planPrices(
  direction: 'BUY' | 'SELL',
  basis: TfSnapshot,
  candles: Candle[],
  { buffer, minStop, clamp, tp1Risk, tp2Risk }: PlanGrid,
): TradePlan {
  const atrBasis = Math.max(basis.atr, 0.05);
  const tf = basis.tf;
  const closed = candles.slice(0, -1);
  const last12 = closed.slice(-12);
  const last30 = closed.slice(-30);
  const breakoutLevel =
    direction === 'BUY'
      ? Math.max(...last30.map((c) => c.high))
      : Math.min(...last30.map((c) => c.low));
  const priceNow = closed[closed.length - 1]?.close ?? basis.close;
  const distToEma = direction === 'BUY' ? priceNow - basis.ema20 : basis.ema20 - priceNow;

  let setupType: string;
  let entry: number;
  if (direction === 'BUY' ? priceNow > breakoutLevel : priceNow < breakoutLevel) {
    setupType = `Breakout — lanjutan tren menembus swing 30 bar ${tf}`;
    entry = priceNow;
  } else if (distToEma > 0.6 * atrBasis) {
    setupType = `Pullback — limit di zona EMA20 ${tf}`;
    entry = basis.ema20;
  } else {
    setupType = 'Pantulan langsung di sekitar harga saat ini';
    entry = priceNow;
  }

  const swingExtreme =
    direction === 'BUY'
      ? Math.min(...last12.map((c) => c.low))
      : Math.max(...last12.map((c) => c.high));

  const slRaw =
    direction === 'BUY'
      ? Math.min(swingExtreme - buffer * atrBasis, entry - minStop * atrBasis)
      : Math.max(swingExtreme + buffer * atrBasis, entry + minStop * atrBasis);

  // Clamp stop distance to the style's ATR band.
  const rawDist = Math.abs(entry - slRaw);
  const capped = Math.min(Math.max(rawDist, clamp[0] * atrBasis), clamp[1] * atrBasis);
  const sl = direction === 'BUY' ? entry - capped : entry + capped;

  const risk = Math.abs(entry - sl);
  const tp1 = direction === 'BUY' ? entry + tp1Risk * risk : entry - tp1Risk * risk;
  const tp2 = direction === 'BUY' ? entry + tp2Risk * risk : entry - tp2Risk * risk;

  return {
    verdict: direction,
    confidence: 0,
    setupType,
    entry: round2(entry),
    sl: round2(sl),
    tp1: round2(tp1),
    tp2: round2(tp2),
    rr1: tp1Risk,
    rr2: tp2Risk,
    stopDistance: round2(risk),
    basisTf: tf,
    spread: 0,
    action: describeAction(direction, entry, priceNow),
  };
}

/** Spread in USD from the quote, when both sides are present and sane. */
function quoteSpread(quote: Quote | null): number | null {
  if (!quote || quote.ask === null || quote.bid === null) return null;
  const spread = quote.ask - quote.bid;
  return Number.isFinite(spread) && spread > 0 ? round2(spread) : null;
}

export function computeAnalysis(input: SignalInput): Analysis {
  const nowSec = Math.floor(Date.now() / 1000);
  const { candles, quote, tvRatings, events } = input;
  const style: Style = input.style ?? (process.env.ENTRY_STYLE === 'scalp' ? 'scalp' : 'swing');
  const spread = quoteSpread(quote);
  const basisTf = GRIDS[style].basisTf;

  const mtf: TfSnapshot[] = TIMEFRAMES.map((tf) => buildSnapshot(candles[tf], tf));
  const snap: Record<TF, TfSnapshot> = Object.fromEntries(mtf.map((s) => [s.tf, s])) as Record<TF, TfSnapshot>;

  const weights = style === 'scalp' ? SCALP_WEIGHT : TF_WEIGHT;
  const bias =
    mtf.reduce((acc, s) => acc + s.trendScore * weights[s.tf], 0) /
    mtf.reduce((acc, s) => acc + weights[s.tf], 0);

  const priceNow = quote?.last ?? snap[ENTRY_TF].close;
  // Scalp levels come from the lower timeframes the trade actually lives on.
  const levels =
    style === 'scalp'
      ? buildLevels(candles.H1, candles.M15, candles.H4, priceNow)
      : buildLevels(candles.H4, candles.H1, candles.D1, priceNow);
  const patterns: Pattern[] = [
    ...detectPatterns(candles.M5, 'M5'),
    ...detectPatterns(candles.M15, 'M15'),
    ...detectPatterns(candles.H1, 'H1'),
    ...detectPatterns(candles.H4, 'H4', 2),
  ];
  // Scalp trades live minutes, not hours: only the release itself blocks them.
  const newsRisk = assessNewsRisk(events, nowSec, style === 'scalp' ? 15 * 60 : 3600);

  const weightLabel = style === 'scalp' ? 'D1:H4:H1:M15:M5:M1 = 1:1:2:2:3:1' : 'D1:H4:H1:M15:M5 = 3:3:2:1:1';
  const reasons: string[] = [
    `Bias multi-timeframe (${weightLabel}): skor ${bias >= 0 ? '+' : ''}${bias.toFixed(2)} — ${
      bias > 0.25 ? 'cenderung BUY' : bias < -0.25 ? 'cenderung SELL' : 'netral / ranging'
    }.`,
  ];
  for (const s of mtf) {
    reasons.push(`${s.tf}: tren ${trendWord(s.trend)} (skor ${s.trendScore >= 0 ? '+' : ''}${s.trendScore.toFixed(2)}), RSI ${s.rsi.toFixed(1)}, EMA20 ${s.ema20.toFixed(2)}.`);
  }

  const warnings: string[] = [];
  if (newsRisk.level !== 'none') warnings.push(newsRisk.note);

  const direction: 'BUY' | 'SELL' | null = bias >= 0.25 ? 'BUY' : bias <= -0.25 ? 'SELL' : null;

  if (!direction) {
    const plan: TradePlan = {
      verdict: 'WAIT',
      confidence: Math.round(50 - Math.abs(bias) * 20),
      setupType: 'Tidak ada setup — konfirmasi arah belum cukup',
      entry: null,
      sl: null,
      tp1: null,
      tp2: null,
      rr1: null,
      rr2: null,
      stopDistance: null,
      basisTf: ENTRY_TF,
      spread,
      action: {
        kind: 'HOLD',
        label: 'Tunggu',
        note: 'Tidak ada aksi yang perlu dilakukan — tunggu konfirmasi arah yang lebih jelas sebelum menyusun rencana entry.',
      },
    };
    warnings.push('Tunggu breakout struktur atau pullback yang lebih jelas sebelum entry.');
    return {
      symbol: input.symbol,
      quote,
      generatedAt: nowSec,
      plan,
      reasons,
      warnings,
      mtf,
      levels,
      patterns,
      newsRisk,
    };
  }

  const up = direction === 'BUY';
  const ctx: ScoreContext = { points: 0, reasons: [], warnings: [] };
  const rules = style === 'scalp' ? SCALP_RULES : SWING_RULES;
  const momentum = basisTf;
  const momentumSnap = snap[momentum];

  // 1) Higher-timeframe trend agreement
  const h4Aligned = up ? snap.H4.trend === 'UP' : snap.H4.trend === 'DOWN';
  const h1Aligned = up ? snap.H1.trend === 'UP' : snap.H1.trend === 'DOWN';
  if (h4Aligned && h1Aligned) addPoint(ctx, 2, `Tren H4 dan H1 sejajar ${direction} — konfirmasi kuat.`);
  else if (h4Aligned || h1Aligned) addPoint(ctx, 1, 'Hanya satu dari H4/H1 yang sejarah — konfirmasi parsial.');
  else addWarn(ctx, -1, 'Tren H4 dan H1 tidak sejajar dengan arah bias — berhati-hatilah.');

  // 2) D1 context
  if (up ? snap.D1.trend !== 'DOWN' : snap.D1.trend !== 'UP') {
    addPoint(ctx, 1, `Konteks D1 ${trendWord(snap.D1.trend)} — tidak menentang arah entry.`);
  } else {
    addWarn(ctx, -1, `D1 berlawanan arah (${trendWord(snap.D1.trend)}) — entry melawan tren jangka panjang.`);
  }

  // 3) Momentum on the entry timeframe
  const rsiEntry = momentumSnap.rsi;
  const [lo, hi] = up ? rules.rsi.buy : rules.rsi.sell;
  const healthy = rsiEntry >= lo && rsiEntry <= hi;
  const extreme = up ? rsiEntry > 72 : rsiEntry < 28;
  if (healthy) addPoint(ctx, 1, `RSI ${momentum} ${rsiEntry.toFixed(1)} — momentum sehat, masih ada ruang bergerak.`);
  else if (extreme) addWarn(ctx, -1, `RSI ${momentum} ${rsiEntry.toFixed(1)} sudah ${up ? 'overbought' : 'oversold'} — risiko kejar harga.`);
  else addWarn(ctx, -1, `RSI ${momentum} ${rsiEntry.toFixed(1)} belum konfirmasi momentum ${direction}.`);

  const entryHist = macd(candles[momentum].map((c) => c.close)).hist;
  const histNow = lastValue(entryHist) ?? 0;
  const histPrev = prevValue(entryHist) ?? 0;
  const histRising = up ? histNow > histPrev : histNow < histPrev;
  if (histRising) addPoint(ctx, 1, `Histogram MACD ${momentum} menguat ke ${histNow.toFixed(2)} — momentum sesuai arah.`);
  else addWarn(ctx, -1, `Histogram MACD ${momentum} melemah (${histNow.toFixed(2)}) — momentum belum mendukung.`);

  // 4) Pullback quality vs EMA20 of the entry timeframe
  const distToEma = up ? priceNow - momentumSnap.ema20 : momentumSnap.ema20 - priceNow;
  const atrEntry = Math.max(momentumSnap.atr, 0.05);
  if (distToEma <= rules.nearEma * atrEntry) {
    addPoint(ctx, 1, `Harga dekat EMA20 ${momentum} (${momentumSnap.ema20.toFixed(2)}) — zona entry pullback wajar.`);
  } else if (distToEma > rules.chaseEma * atrEntry) {
    addWarn(ctx, -1, `Harga sudah ${(distToEma / atrEntry).toFixed(1)}× ATR ${momentum} dari EMA20 — risiko kejar harga tinggi.`);
  } else {
    reasons.push(`Jarak ke EMA20 ${momentum} ${(distToEma / atrEntry).toFixed(1)}× ATR — masih wajar.`);
  }

  // 5) Candle trigger
  const alignedPattern = patterns.find((p) => (up ? p.direction === 'bull' : p.direction === 'bear'));
  if (alignedPattern) {
    addPoint(ctx, 1, `Pola pemicu ${alignedPattern.name} pada ${alignedPattern.tf}.`);
  } else {
    warnings.push('Belum ada pola candle pemicu yang sejajar — pertimbangkan menunggu konfirmasi close.');
  }

  // 6) TradingView rating confluence
  const rating = tvRatings[momentum] ?? tvRatings.H1 ?? tvRatings.H4;
  if (rating !== null && rating !== undefined) {
    const favors = up ? rating > 0.5 : rating < -0.5;
    const against = up ? rating < -0.5 : rating > 0.5;
    if (favors) addPoint(ctx, 1, `Rating teknikal TradingView ${rating.toFixed(1)} — sejajar arah entry.`);
    else if (against) addWarn(ctx, -1, `Rating teknikal TradingView ${rating.toFixed(1)} berlawanan arah.`);
    else reasons.push(`Rating teknikal TradingView netral (${rating.toFixed(1)}).`);
  }

  // 7) Nearby structure confluence
  const nearby = levels
    .filter((lv) => Math.abs(lv.price - priceNow) <= 0.5 * atrEntry && (up ? lv.price < priceNow : lv.price > priceNow))
    .sort((a, b) => Math.abs(a.price - priceNow) - Math.abs(b.price - priceNow))[0];
  if (nearby) {
    addPoint(ctx, 1, `${nearby.label} ${nearby.price.toFixed(2)} di dekat harga — pijakan ${up ? 'support' : 'resistance'} untuk entry.`);
  }

  // Assemble plan — stop geometry comes from the style's basis timeframe.
  const plan = planPrices(direction, momentumSnap, candles[momentum], GRIDS[style].grid);
  plan.spread = spread;
  plan.confidence = Math.min(95, Math.max(10, Math.round(50 + 6.5 * ctx.points)));
  reasons.push(...ctx.reasons);
  warnings.push(...ctx.warnings);

  if (ctx.points >= rules.minPoints) {
    plan.verdict = direction;
  } else if (ctx.points === rules.minPoints - 1) {
    plan.verdict = direction;
    warnings.push(
      `Konfirmasi moderat (skor ${ctx.points} dari ${rules.minPoints}) — pertimbangkan risiko lebih kecil atau tunggu candle pemicu berikutnya.`,
    );
  } else {
    plan.verdict = 'WAIT';
    plan.setupType = `Konfirmasi ${direction} belum cukup (skor ${ctx.points}) — ${plan.setupType}`;
    warnings.push('Skor konfluensi di bawah ambang — disiplin menunggu setup yang lebih bersih.');
  }

  if (newsRisk.level === 'high' && plan.verdict !== 'WAIT') {
    plan.verdict = 'WAIT';
    plan.setupType = `TERTUNDA (news high-impact) — ${plan.setupType}`;
    warnings.push('Verdict diturunkan ke WAIT karena jendela news high-impact.');
  }

  if (plan.verdict === 'WAIT' && plan.action.kind !== 'HOLD') {
    const prepared = plan.action.label;
    plan.action = {
      kind: 'HOLD',
      label: 'Tunggu',
      note:
        newsRisk.level === 'high'
          ? `Jangan pasang order dulu — news high-impact sedang dekat; rencana ${prepared} hanya berlaku setelah jendela rilis lewat.`
          : `Jangan pasang order dulu — konfirmasi belum cukup; rencana ${prepared} di level ENTRY hanya skenario pengamatan.`,
    };
  }

  // Human-readable plan rationale — distances in the basis TF's ATRs.
  if (plan.entry !== null && plan.sl !== null && plan.tp1 !== null && plan.tp2 !== null && plan.stopDistance !== null) {
    const atrBasis = Math.max(snap[basisTf].atr, 0.05);
    const costNote =
      spread !== null
        ? ` Spread ${spread.toFixed(2)} masuk sebagai biaya: risiko efektif ${(plan.stopDistance + spread).toFixed(2)} USD.`
        : '';
    reasons.push(
      `Rencana ${style} ${direction}: entry ${plan.entry.toFixed(2)} (${plan.setupType.split('—')[0].trim()}), SL ${plan.sl.toFixed(2)} (jarak ${plan.stopDistance.toFixed(2)} ≈ ${(plan.stopDistance / atrBasis).toFixed(1)}× ATR ${basisTf}), TP1 ${plan.tp1.toFixed(2)} (${plan.rr1}R), TP2 ${plan.tp2.toFixed(2)} (${plan.rr2}R).${costNote}`,
    );
    const conflicts = levels.filter(
      (lv) =>
        Math.abs(lv.price - plan.tp2!) < 0.4 * atrBasis &&
        (direction === 'BUY' ? lv.price > plan.entry! : lv.price < plan.entry!),
    );
    for (const lv of conflicts) {
      warnings.push(`TP2 ${plan.tp2!.toFixed(2)} berimpit dengan ${lv.label.toLowerCase()} ${lv.price.toFixed(2)} — pertimbangkan ambil untung parsial.`);
    }
    if (style === 'scalp' && spread !== null && spread > plan.stopDistance * 0.25) {
      warnings.push(`Spread ${spread.toFixed(2)} > 25% jarak SL — setelah biaya RR efektif turun; pertimbangkan skip trade ini.`);
    }
  }

  return {
    symbol: input.symbol,
    quote,
    generatedAt: nowSec,
    plan,
    reasons,
    warnings,
    mtf,
    levels,
    patterns,
    newsRisk,
  };
}
