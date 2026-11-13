import { TradingViewError } from '../errors.js';
/**
 * Everything a price chart needs, in one JSON object: candles, indicator lines, warm-up and
 * split times, signals with their `refBars`, and the trades of each exit. Pass the same signal
 * function as the run to get its indicators (for `rsiDivergence`: `rsi` and `ema`).
 */
export function chartData(report, snapshot, signal) {
    if (snapshot.sha256 !== report.snapshot.sha256)
        throw new TradingViewError('INVALID_ARGUMENT', 'chartData(): the snapshot is not the one this report ran on');
    const raw = signal?.indicators?.(snapshot.candles) ?? {};
    const indicators = Object.fromEntries(Object.entries(raw).map(([name, values]) => [
        name, Array.from({ length: snapshot.candles.length }, (_, i) => (Number.isFinite(values[i]) ? values[i] : null)),
    ]));
    const trades = Object.fromEntries(report.settings.exits.map((e) => [e.id, []]));
    for (const trade of report.trades)
        (trades[trade.exit] ??= []).push(trade);
    for (const list of Object.values(trades))
        list.sort((a, b) => a.entryBar - b.entryBar);
    return {
        bars: snapshot.candles.map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume })),
        indicators,
        warmupEndTime: report.segments.inSample.startTime,
        splitTime: report.segments.outOfSample.startTime,
        signals: report.signals,
        trades,
    };
}
