import { useState } from 'react';
import type { TradeRecord } from '../../../shared/types';
import { fmtDateWib, fmtNum, fmtPrice, fmtTimeWib } from '../lib/format';

const STATUS_CHIP: Record<TradeRecord['status'], { label: string; chip: string }> = {
  RUNNING: { label: 'BERJALAN', chip: 'bg-warn/15 text-warn border-warn/30' },
  TP_HIT: { label: 'TAKE PROFIT', chip: 'bg-up/15 text-up border-up/30' },
  SL_HIT: { label: 'STOP LOSS', chip: 'bg-down/15 text-down border-down/30' },
};

export default function TradeHistory({ trades }: { trades: TradeRecord[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="rise rounded-lg border border-line bg-ink-900/80 p-4">
      <h2 className="font-display text-sm tracking-[0.25em] text-gold-soft">RIWAYAT TRADING</h2>
      <p className="mt-1 text-[10px] text-mute">
        Sinyal BUY/SELL tercatat otomatis · status dihitung dari harga real-time (TP = tp1) · klik untuk detail
      </p>

      <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
        {trades.length === 0 && (
          <p className="py-6 text-center text-xs text-mute">Belum ada sinyal yang tercatat.</p>
        )}
        {trades.map((t) => {
          const chip = STATUS_CHIP[t.status];
          return (
            <button
              key={t.id}
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              className="w-full rounded border border-line-soft bg-ink-850/50 px-2 py-1.5 text-left text-xs transition-colors hover:border-line"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] tracking-wider ${
                      t.direction === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
                    }`}
                  >
                    {t.direction}
                  </span>
                  <span className="text-mute">
                    {fmtDateWib(t.createdAt)} · {fmtTimeWib(t.createdAt)} WIB
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="num text-fg/80">
                    E {fmtPrice(t.entry)} · SL {fmtPrice(t.sl)} · TP {fmtPrice(t.tp1)}
                  </span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${chip.chip}`}>{chip.label}</span>
                </span>
              </div>
              {t.status !== 'RUNNING' && t.exitPrice !== null && t.closedAt !== null && (
                <p className="mt-0.5 text-[11px] text-mute">
                  Exit {fmtPrice(t.exitPrice)} · ditutup {fmtTimeWib(t.closedAt)} WIB · confidence{' '}
                  {fmtNum(t.confidence)}
                </p>
              )}
              {t.status === 'RUNNING' && !t.filled && (
                <p className="mt-0.5 text-[11px] text-warn">
                  Menunggu harga menyentuh entry ({t.action.label}).
                </p>
              )}
              {expanded === t.id && (
                <div className="mt-1.5 space-y-1 border-t border-line-soft pt-1.5">
                  <p className="text-[11px] text-fg/80">{t.setupType}</p>
                  <p className="text-[11px] text-mute">
                    Eksekusi: {t.action.label} — {t.action.note}
                  </p>
                  <ul className="space-y-0.5">
                    {t.reasons.map((r, i) => (
                      <li key={i} className="text-[11px] leading-relaxed text-mute">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
