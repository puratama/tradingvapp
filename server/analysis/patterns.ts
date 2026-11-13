/** Candlestick pattern detection on the last closed bars of one timeframe. */
import type { Candle, Pattern, TF } from '../../shared/types.js';

interface Bar {
  body: number;
  range: number;
  upper: number;
  lower: number;
  bull: boolean;
  bear: boolean;
}

function shape(c: Candle): Bar {
  const body = Math.abs(c.close - c.open);
  const range = Math.max(c.high - c.low, 1e-9);
  return {
    body,
    range,
    upper: c.high - Math.max(c.open, c.close),
    lower: Math.min(c.open, c.close) - c.low,
    bull: c.close > c.open,
    bear: c.close < c.open,
  };
}

/**
 * Patterns among the last `scan` CLOSED bars (the forming bar is excluded).
 * Returns only notable hits, newest first.
 */
export function detectPatterns(candles: Candle[], tf: TF, scan = 3): Pattern[] {
  const closed = candles.slice(0, -1);
  const hits: Pattern[] = [];

  for (let idx = closed.length - 1; idx >= Math.max(1, closed.length - scan); idx--) {
    const cur = shape(closed[idx]);
    const prev = shape(closed[idx - 1]);

    // Engulfing
    if (cur.bull && prev.bear && closed[idx].close > closed[idx - 1].open && closed[idx].open < closed[idx - 1].close && cur.body > 0.6 * cur.range && cur.body > prev.body) {
      hits.push({ name: 'Bullish Engulfing', direction: 'bull', tf, time: closed[idx].time, note: 'Body bullish menelan body bearish sebelumnya — tekanan beli agresif.' });
      continue;
    }
    if (cur.bear && prev.bull && closed[idx].close < closed[idx - 1].open && closed[idx].open > closed[idx - 1].close && cur.body > 0.6 * cur.range && cur.body > prev.body) {
      hits.push({ name: 'Bearish Engulfing', direction: 'bear', tf, time: closed[idx].time, note: 'Body bearish menelan body bullish sebelumnya — tekanan jual agresif.' });
      continue;
    }

    // Pin bars
    if (cur.lower >= 2 * cur.body && cur.upper < cur.body && cur.body > 0.08 * cur.range) {
      hits.push({ name: 'Hammer / Pin Bar Bullish', direction: 'bull', tf, time: closed[idx].time, note: 'Ekor bawah panjang — penolakan harga bawah.' });
      continue;
    }
    if (cur.upper >= 2 * cur.body && cur.lower < cur.body && cur.body > 0.08 * cur.range) {
      hits.push({ name: 'Shooting Star / Pin Bar Bearish', direction: 'bear', tf, time: closed[idx].time, note: 'Ekor atas panjang — penolakan harga atas.' });
      continue;
    }

    // Morning / Evening star (3 bars): current + 2 back
    const idx2 = idx - 2;
    if (idx2 >= 0) {
      const first = shape(closed[idx2]);
      const mid = shape(closed[idx - 1]);
      const smallMid = mid.body < 0.35 * mid.range;
      if (first.bear && smallMid && cur.bull && cur.body > 0.5 * first.body && closed[idx].close > (closed[idx2].open + closed[idx2].close) / 2) {
        hits.push({ name: 'Morning Star', direction: 'bull', tf, time: closed[idx].time, note: 'Tiga batang: tekanan jual melemah lalu pembalikan naik.' });
        continue;
      }
      if (first.bull && smallMid && cur.bear && cur.body > 0.5 * first.body && closed[idx].close < (closed[idx2].open + closed[idx2].close) / 2) {
        hits.push({ name: 'Evening Star', direction: 'bear', tf, time: closed[idx].time, note: 'Tiga batang: tekanan beli melemah lalu pembalikan turun.' });
        continue;
      }
    }

    // Inside bar
    if (closed[idx].high < closed[idx - 1].high && closed[idx].low > closed[idx - 1].low) {
      hits.push({ name: 'Inside Bar', direction: 'neutral', tf, time: closed[idx].time, note: 'Konsolidasi — arah berikutnya menunggu breakout range induk.' });
    }
  }

  return hits.slice(0, 4);
}
