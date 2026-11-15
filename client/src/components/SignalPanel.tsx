import type { Analysis, NewsRisk, TradePlan } from '../../../shared/types';
import { fmtPrice, fmtTimeWib } from '../lib/format';
import { Chip, tone, type Tone } from '../ui/Chip';
import { NUM, SECTION_TITLE } from '../ui/styles';

const VERDICT: Record<TradePlan['verdict'], { tone: Tone; label: string }> = {
  BUY: { tone: 'bull', label: 'Beli' },
  SELL: { tone: 'bear', label: 'Jual' },
  WAIT: { tone: 'warn', label: 'Tunggu' },
};

const NEWS_RISK: Record<NewsRisk['level'], { tone: Tone; label: string }> = {
  none: { tone: 'bull', label: 'Jendela aman' },
  caution: { tone: 'warn', label: 'Waspada news' },
  high: { tone: 'bear', label: 'News high-impact' },
};

/** One ladder row: TP2 → TP1 → Entry → SL, plus the live price marker. */
function LevelRow({
  label,
  value,
  color,
  strong = false,
}: {
  label: string;
  value: number | null;
  color: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-16 shrink-0 text-2xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={`h-px flex-1 ${strong ? 'bg-line-strong' : 'bg-line'}`} aria-hidden />
      <span className={`${NUM} shrink-0 text-sm ${strong ? 'font-semibold' : 'font-medium'} ${color}`}>{fmtPrice(value)}</span>
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
  const verdict = VERDICT[plan.verdict];
  const news = NEWS_RISK[newsRisk.level];
  const last = analysis.quote?.last ?? null;

  return (
    <section className="rise">
      {/* Verdict: the one thing that should read first. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-2xl font-semibold leading-none ${tone(verdict.tone)}`}>{verdict.label}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone={verdict.tone}>{plan.setupType}</Chip>
            <Chip tone={news.tone}>{news.label}</Chip>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`${NUM} text-2xl font-semibold leading-none text-fg`}>
            {plan.confidence}
            <span className="text-sm font-normal text-muted">%</span>
          </div>
          <div className="mt-1 text-2xs text-muted">konfluensi</div>
        </div>
      </div>

      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            plan.verdict === 'BUY' ? 'bg-bull' : plan.verdict === 'SELL' ? 'bg-bear' : 'bg-warn'
          }`}
          style={{ width: `${plan.confidence}%` }}
          role="progressbar"
          aria-valuenow={plan.confidence}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Skor konfluensi"
        />
      </div>

      {/* Action: what to place, in one line. */}
      <div className="mt-3 flex items-baseline gap-2 rounded-md bg-surface-2 px-2.5 py-2">
        <span className={`shrink-0 text-xs font-semibold ${plan.action.kind === 'HOLD' ? 'text-warn' : 'text-fg'}`}>
          {plan.action.label}
        </span>
        <span className="min-w-0 text-xs leading-snug text-muted">{plan.action.note}</span>
      </div>

      {/* Levels: a ladder, not four equal cards. */}
      <div className="mt-3">
        <LevelRow label="TP2" value={plan.tp2} color="text-bull/80" />
        <LevelRow label="TP1" value={plan.tp1} color="text-bull" />
        <LevelRow label="Entry" value={plan.entry} color="text-fg" strong />
        {last !== null && (
          <div className="flex items-center gap-2 py-0.5">
            <span className="w-16 shrink-0" />
            <span className="h-px flex-1 border-t border-dashed border-accent/50" aria-hidden />
            <span className={`${NUM} shrink-0 text-2xs text-accent`}>harga {fmtPrice(last)}</span>
          </div>
        )}
        <LevelRow label="SL" value={plan.sl} color="text-bear" />
      </div>

      {/* Risk/reward as one compact line. */}
      <div className={`${NUM} mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted`}>
        {plan.rr1 !== null && (
          <span>
            RR1 <span className="font-medium text-fg">1:{plan.rr1.toFixed(1)}</span>
          </span>
        )}
        {plan.rr2 !== null && (
          <span>
            RR2 <span className="font-medium text-fg">1:{plan.rr2.toFixed(1)}</span>
          </span>
        )}
        {plan.stopDistance !== null && (
          <span>
            SL <span className="font-medium text-fg">${plan.stopDistance.toFixed(2)}</span>/lot
          </span>
        )}
      </div>

      <div className={`mt-3 rounded-md px-2.5 py-2 text-2xs leading-relaxed ${news.tone === 'bull' ? 'bg-bull-soft text-bull' : news.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-bear-soft text-bear'}`}>
        {newsRisk.note}
      </div>

      {compact ? (
        <button
          onClick={onDetail}
          disabled={!onDetail}
          className="mt-3 flex w-full items-center justify-between rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
        >
          <span>
            {reasons.length} alasan
            {warnings.length > 0 && ` · ${warnings.length} peringatan`}
          </span>
          <span aria-hidden>→</span>
        </button>
      ) : (
        <>
          <h3 className={`mt-5 ${SECTION_TITLE}`}>Alasan keputusan</h3>
          <ul className="mt-2 space-y-1.5">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2 text-xs leading-relaxed text-fg/80">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                <span>{r}</span>
              </li>
            ))}
          </ul>

          {warnings.length > 0 && (
            <>
              <h3 className={`mt-5 ${SECTION_TITLE} text-warn`}>Peringatan</h3>
              <ul className="mt-2 space-y-1.5">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2 rounded-md bg-warn-soft px-2.5 py-1.5 text-xs leading-relaxed text-warn">
                    <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-warn/60 text-center text-[9px] font-bold leading-[0.8rem]">
                      !
                    </span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-4 text-2xs text-faint">Dihitung {fmtTimeWib(analysis.generatedAt)} WIB</p>
        </>
      )}
    </section>
  );
}
