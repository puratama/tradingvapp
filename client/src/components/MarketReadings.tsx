import type { Level, Quote, TF, TfSnapshot } from '../../../shared/types';
import { fmtPrice } from '../lib/format';
import { Chip } from '../ui/Chip';
import { NUM } from '../ui/styles';

/**
 * Decision-panel side blocks: where price sits vs the plan levels, and the
 * concrete technical readings behind the verdict. Values only — no new
 * signals are derived here.
 */

export function LevelLadder({ levels, quote, plan }: { levels: Level[]; quote: Quote | null; plan: { entry: number | null; sl: number | null; tp1: number | null; tp2: number | null } }) {
  const last = quote?.last ?? null;
  const markers = [
    { price: plan.tp2, label: 'TP2', tone: 'bull' as const },
    { price: plan.tp1, label: 'TP1', tone: 'bull' as const },
    { price: plan.entry, label: 'Entry', tone: 'neutral' as const },
    { price: plan.sl, label: 'SL', tone: 'bear' as const },
  ].filter((m) => m.price !== null);

  const rows = [
    ...levels.map((l) => ({ price: l.price, label: l.label, strength: l.strength, kind: l.kind })),
    ...markers.map((m) => ({ price: m.price as number, label: m.label, strength: 0, kind: m.tone === 'bear' ? 'sl' : m.tone === 'bull' ? 'tp' : 'entry' })),
  ].sort((a, b) => b.price - a.price);

  return (
    <div>
      <h3 className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Level kunci
        {last !== null && <span className={`${NUM} text-2xs font-medium normal-case text-fg/70`}>harga {fmtPrice(last)}</span>}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Tidak ada level signifikan.</p>
      ) : (
        <ul className="mt-2 space-y-px">
          {rows.map((r) => {
            const above = last !== null && r.price > last;
            const isPlan = r.kind === 'entry' || r.kind === 'tp' || r.kind === 'sl';
            const color = r.kind === 'sl' ? 'text-bear' : r.kind === 'tp' ? 'text-bull' : r.kind === 'entry' ? 'text-fg' : 'text-fg/80';
            return (
              <li key={`${r.kind}-${r.price}-${r.label}`} className={`flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs ${isPlan ? 'bg-surface-2' : 'hover:bg-surface-2'}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${above ? 'bg-bear/70' : 'bg-bull/70'}`} aria-hidden />
                <span className={`min-w-0 flex-1 truncate ${isPlan ? 'font-medium' : ''} ${color}`} title={r.label}>
                  {r.label}
                </span>
                {r.strength > 0 && (
                  <span className="text-2xs text-warn" aria-label={`kekuatan ${r.strength}`}>
                    {'★'.repeat(r.strength)}
                  </span>
                )}
                <span className={`${NUM} shrink-0 ${color}`}>{fmtPrice(r.price)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const TREND_LABEL: Record<TfSnapshot['trend'], { label: string; tone: 'bull' | 'bear' | 'neutral' }> = {
  UP: { label: 'Naik', tone: 'bull' },
  DOWN: { label: 'Turun', tone: 'bear' },
  RANGE: { label: 'Range', tone: 'neutral' },
};

/** Compact per-timeframe readings; the same numbers as the MTF table. */
export function TfReadings({ mtf, activeTf }: { mtf: TfSnapshot[]; activeTf: TF }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Indikator per timeframe</h3>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-2xs font-medium uppercase tracking-wide text-muted">
            <th className="pb-1 text-left font-medium">TF</th>
            <th className="pb-1 text-left font-medium">Tren</th>
            <th className="pb-1 text-right font-medium">RSI</th>
            <th className="pb-1 text-right font-medium">MACD</th>
            <th className="pb-1 text-right font-medium">ATR</th>
          </tr>
        </thead>
        <tbody>
          {mtf.map((s) => {
            const t = TREND_LABEL[s.trend];
            return (
              <tr key={s.tf} className={`border-t border-line/60 ${s.tf === activeTf ? 'bg-accent-soft/40' : ''}`}>
                <td className={`py-1.5 font-semibold ${s.tf === activeTf ? 'text-accent-strong' : 'text-fg'}`}>{s.tf}</td>
                <td className="py-1.5">
                  <Chip tone={t.tone}>{t.label}</Chip>
                </td>
                <td className={`${NUM} py-1.5 text-right ${s.rsi > 70 ? 'text-bear' : s.rsi < 30 ? 'text-bull' : 'text-fg/80'}`}>
                  {s.rsi.toFixed(1)}
                </td>
                <td className={`${NUM} py-1.5 text-right ${s.macdHist > 0 ? 'text-bull' : 'text-bear'}`}>{s.macdHist.toFixed(2)}</td>
                <td className={`${NUM} py-1.5 text-right text-fg/80`}>{fmtPrice(s.atr)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
