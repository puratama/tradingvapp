import { useState } from 'react';
import type { NewsEvent } from '../../../shared/types';
import { countdown, dayKey, fmtDayLabel, fmtTimeWib } from '../lib/format';
import { Chip, type Tone } from '../ui/Chip';
import { Segmented } from '../ui/Button';
import { NUM } from '../ui/styles';

const IMPACT: Record<NewsEvent['impact'], { tone: Tone; dot: string }> = {
  High: { tone: 'bear', dot: 'bg-bear' },
  Medium: { tone: 'warn', dot: 'bg-warn' },
  Low: { tone: 'neutral', dot: 'bg-neutral' },
};

const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'High', label: 'High' },
  { id: 'Medium', label: 'Medium' },
] as const;

export default function NewsPanel({ events }: { events: NewsEvent[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('High');
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = Math.floor(Date.now() / 1000);

  const visible = filter === 'all' ? events : events.filter((ev) => ev.impact === filter);
  const grouped: { key: string; label: string; items: NewsEvent[] }[] = [];
  for (const ev of visible) {
    const key = dayKey(ev.timestamp);
    const group = grouped.find((g) => g.key === key);
    if (group) group.items.push(ev);
    else grouped.push({ key, label: fmtDayLabel(ev.timestamp, now), items: [ev] });
  }

  return (
    <section className="rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Waktu WIB · klik event untuk dampaknya ke XAUUSD</p>
        <Segmented options={FILTERS.map((f) => ({ id: f.id, label: f.label }))} value={filter} onChange={setFilter} ariaLabel="Filter dampak" />
      </div>

      <div className="mt-3 space-y-4">
        {grouped.length === 0 && (
          <p className="py-6 text-center text-xs text-muted">Tidak ada event dengan filter ini.</p>
        )}
        {grouped.map((g) => (
          <div key={g.key}>
            <div className="sticky top-0 z-10 bg-white pb-1 text-2xs font-medium uppercase tracking-wide text-muted">
              {g.label}
            </div>
            <ul className="space-y-1">
              {g.items.map((ev) => {
                const open = expanded === ev.id;
                const style = IMPACT[ev.impact];
                return (
                  <li key={ev.id} className="rounded-md border border-line bg-surface transition-colors hover:border-line-strong">
                    <button
                      onClick={() => setExpanded(open ? null : ev.id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                      <span className={`${NUM} w-10 shrink-0 pt-px text-xs text-muted`}>{fmtTimeWib(ev.timestamp)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-fg">{ev.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
                          <Chip tone={style.tone}>{ev.impact}</Chip>
                          <span className="rounded-sm border border-line px-1 py-px font-medium">{ev.currency}</span>
                          {ev.forecast && <span>fcst {ev.forecast}</span>}
                          {ev.previous && <span>prev {ev.previous}</span>}
                          {ev.actual && <span className="font-medium text-accent">act {ev.actual}</span>}
                          <span className={`${NUM} ml-auto ${ev.timestamp > now ? 'text-fg/70' : 'text-faint'}`}>
                            {countdown(ev.timestamp, now)}
                          </span>
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-line px-3 py-2.5 text-xs leading-relaxed">
                        <div className="flex gap-2">
                          <Chip tone={ev.gold.relevance === 'langsung' ? 'accent' : 'neutral'}>{ev.gold.relevance}</Chip>
                          <p className="text-fg/85">{ev.gold.whyItMatters}</p>
                        </div>
                        <p className="mt-2 text-muted">
                          <span className="text-2xs font-medium uppercase tracking-wide text-muted">Proyeksi dampak</span>
                          <br />
                          {ev.gold.typicalEffect}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
