import type { Analysis, NewsRisk, TradePlan } from '../../../shared/types';
import { fmtPrice } from '../lib/format';

const VERDICT: Record<TradePlan['verdict'], { word: string; text: string; border: string; badge: string }> = {
  BUY: { word: 'BUY', text: 'text-up', border: 'border-up/40', badge: 'bg-up/15 text-up' },
  SELL: { word: 'SELL', text: 'text-down', border: 'border-down/40', badge: 'bg-down/15 text-down' },
  WAIT: { word: 'WAIT', text: 'text-warn', border: 'border-warn/40', badge: 'bg-warn/15 text-warn' },
};

const NEWS_RISK: Record<NewsRisk['level'], { chip: string; label: string }> = {
  none: { chip: 'bg-up/10 text-up border-up/30', label: 'Jendela aman' },
  caution: { chip: 'bg-gold/10 text-gold-soft border-gold/40', label: 'Waspada news' },
  high: { chip: 'bg-down/10 text-down border-down/40', label: 'News high-impact' },
};

function PriceCell({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className={`border-l-2 ${color} bg-ink-850/60 px-3 py-2`}>
      <div className="text-[10px] tracking-[0.18em] text-mute">{label}</div>
      <div className="num text-lg font-medium text-fg">{fmtPrice(value)}</div>
    </div>
  );
}

interface SignalPanelProps {
  analysis: Analysis;
  /** Sidebar summary: drop the long reason/warning lists into a modal instead. */
  compact?: boolean;
  onDetail?: () => void;
}

export default function SignalPanel({ analysis, compact = false, onDetail }: SignalPanelProps) {
  const { plan, reasons, warnings, newsRisk } = analysis;
  const v = VERDICT[plan.verdict];

  return (
    <section className="rise p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] tracking-[0.18em] text-mute">TERAKHIR DIHITUNG</span>
        <span className="text-[10px] tracking-widest text-mute">
          {new Date(analysis.generatedAt * 1000).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} WIB
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div>
          <div className={`font-display text-5xl leading-none ${v.text}`}>{v.word}</div>
          <div className={`mt-2 inline-block rounded px-2 py-0.5 text-[10px] tracking-widest ${v.badge}`}>
            {plan.setupType.toUpperCase()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.18em] text-mute">KONFLUENSI</div>
          <div className="num text-3xl font-semibold text-fg">{plan.confidence}<span className="text-base text-mute">%</span></div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded bg-ink-800">
        <div
          className={`h-full rounded transition-all duration-700 ${plan.verdict === 'BUY' ? 'bg-up' : plan.verdict === 'SELL' ? 'bg-down' : 'bg-warn'}`}
          style={{ width: `${plan.confidence}%` }}
        />
      </div>

      <div
        className={`mt-3 rounded border px-3 py-2 text-xs leading-relaxed ${
          plan.action.kind === 'HOLD' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-gold/40 bg-gold/10 text-gold-soft'
        }`}
      >
        <span className="font-semibold tracking-wider">ACTION · {plan.action.label}</span>
        <span className="mx-1.5 opacity-50">|</span>
        {plan.action.note}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <PriceCell label="ENTRY" value={plan.entry} color="border-gold" />
        <PriceCell label="STOP LOSS" value={plan.sl} color="border-down" />
        <PriceCell label="TAKE PROFIT 1" value={plan.tp1} color="border-up" />
        <PriceCell label="TAKE PROFIT 2" value={plan.tp2} color="border-up/60" />
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {plan.rr1 !== null && (
          <span className="rounded border border-line bg-ink-850 px-2 py-1 text-mute">
            RR TP1 <span className="num text-fg">1:{plan.rr1.toFixed(1)}</span>
          </span>
        )}
        {plan.rr2 !== null && (
          <span className="rounded border border-line bg-ink-850 px-2 py-1 text-mute">
            RR TP2 <span className="num text-fg">1:{plan.rr2.toFixed(1)}</span>
          </span>
        )}
        {plan.stopDistance !== null && (
          <span className="rounded border border-line bg-ink-850 px-2 py-1 text-mute">
            Jarak SL <span className="num text-fg">${plan.stopDistance.toFixed(2)}</span> / 1 lot
          </span>
        )}
      </div>

      <div className={`mt-3 rounded border px-3 py-2 text-xs leading-relaxed ${NEWS_RISK[newsRisk.level].chip}`}>
        <span className="font-semibold tracking-wider">{NEWS_RISK[newsRisk.level].label}</span>
        <span className="mx-1.5 opacity-50">|</span>
        {newsRisk.note}
      </div>

      {compact ? (
        <button
          onClick={onDetail}
          disabled={!onDetail}
          className="mt-3 w-full rounded border border-line px-2 py-1.5 text-[11px] tracking-wider text-mute transition-colors hover:border-gold/40 hover:text-fg disabled:opacity-50"
        >
          LIHAT {reasons.length} ALASAN{warnings.length > 0 ? ` + ${warnings.length} PERINGATAN` : ''}
        </button>
      ) : (
        <>
          <h3 className="mt-4 text-[10px] tracking-[0.22em] text-mute">ALASAN KEPUTUSAN</h3>
          <ul className="mt-2 space-y-1.5">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2 text-xs leading-relaxed text-fg/85">
                <span className="mt-0.5 text-gold">▸</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>

          {warnings.length > 0 && (
            <>
              <h3 className="mt-4 text-[10px] tracking-[0.22em] text-warn">PERINGATAN</h3>
              <ul className="mt-2 space-y-1.5">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2 rounded border border-warn/25 bg-warn/5 px-2 py-1.5 text-xs leading-relaxed text-warn">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M8 1.5 15 14H1L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
