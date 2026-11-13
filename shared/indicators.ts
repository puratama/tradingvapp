/** Pure indicator math over candle/price arrays. Null-padded at the head. */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI. */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdSeries {
  line: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  );

  const signal: (number | null)[] = new Array(closes.length).fill(null);
  const firstIdx = line.findIndex((v) => v !== null);
  if (firstIdx >= 0 && closes.length - firstIdx >= signalPeriod) {
    const slice = line.slice(firstIdx).map((v) => v as number);
    const sigSlice = ema(slice, signalPeriod);
    for (let i = 0; i < sigSlice.length; i++) signal[firstIdx + i] = sigSlice[i];
  }

  const hist: (number | null)[] = line.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null,
  );
  return { line, signal, hist };
}

/** Wilder ATR. */
export function atr(candles: { high: number; low: number; close: number }[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  let prev = 0;
  for (let i = 0; i < period; i++) prev += tr[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface BollingerBands {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export function bollinger(closes: number[], period = 20, mult = 2): BollingerBands {
  const mid = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (closes[j] - (mid[i] as number)) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = (mid[i] as number) + mult * sd;
    lower[i] = (mid[i] as number) - mult * sd;
  }
  return { mid, upper, lower };
}

/** Last non-null value of a series. */
export function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return series[i];
  }
  return null;
}

/** Second-to-last non-null value (for slope comparisons). */
export function prevValue(series: (number | null)[]): number | null {
  let seen = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) {
      seen += 1;
      if (seen === 2) return series[i];
    }
  }
  return null;
}
