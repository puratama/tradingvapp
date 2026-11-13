/** Shared domain types between server and client. */

export type TF = 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

export const TIMEFRAMES: TF[] = ['M5', 'M15', 'H1', 'H4', 'D1'];

export interface Candle {
  /** Bar open time, Unix seconds UTC. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  last: number;
  change: number;
  changePct: number;
  bid: number | null;
  ask: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  updated: number;
}

export type Trend = 'UP' | 'DOWN' | 'RANGE';

export interface TfSnapshot {
  tf: TF;
  trend: Trend;
  /** Weighted trend score in [-1, 1]. */
  trendScore: number;
  close: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macdHist: number;
  atr: number;
}

export interface Level {
  price: number;
  kind: 'support' | 'resistance' | 'round' | 'pdh' | 'pdl';
  label: string;
  /** 1 minor .. 3 major */
  strength: number;
}

export interface Pattern {
  name: string;
  direction: 'bull' | 'bear' | 'neutral';
  tf: TF;
  /** Bar time (Unix seconds) the pattern completed on. */
  time: number;
  note: string;
}

/** Order type to place at the broker, or HOLD when no order should be placed. */
export type ActionKind = 'BUY_LIMIT' | 'BUY_STOP' | 'SELL_LIMIT' | 'SELL_STOP' | 'MARKET' | 'HOLD';

/** Execution instruction for a trade plan. */
export interface PlanAction {
  kind: ActionKind;
  /** Short label, e.g. "Buy Limit". */
  label: string;
  /** Indonesian instruction: what to place and when it fills. */
  note: string;
}

export interface TradePlan {
  verdict: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  setupType: string;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr1: number | null;
  rr2: number | null;
  /** ATR-based stop distance in USD (also risk per 1.0 lot). */
  stopDistance: number | null;
  /** Execution instruction: order type to place + Indonesian keterangan. */
  action: PlanAction;
}

export interface NewsEvent {
  id: string;
  title: string;
  currency: string;
  /** Localized ISO timestamp with offset. */
  date: string;
  timestamp: number;
  impact: 'High' | 'Medium' | 'Low';
  forecast: string;
  previous: string;
  actual: string;
  gold: {
    relevance: 'langsung' | 'tidak langsung';
    whyItMatters: string;
    typicalEffect: string;
  };
}

export interface NewsRisk {
  level: 'none' | 'caution' | 'high';
  note: string;
  nextHighImpact: NewsEvent | null;
}

export interface Analysis {
  symbol: string;
  quote: Quote | null;
  generatedAt: number;
  plan: TradePlan;
  reasons: string[];
  warnings: string[];
  mtf: TfSnapshot[];
  levels: Level[];
  patterns: Pattern[];
  newsRisk: NewsRisk;
}
