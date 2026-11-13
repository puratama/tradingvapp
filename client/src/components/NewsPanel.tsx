import { useState } from 'react';
import type { NewsEvent } from '../../../shared/types';
import { countdown, dayKey, fmtDayLabel, fmtTimeWib } from '../lib/format';

const IMPACT_CHIP: Record<NewsEvent['impact'], { dot: string; chip: string }> = {
  High: { dot: 'bg-down', chip: 'bg-down/15 text-down border-down/30' },
  Medium: { dot: 'bg-gold', chip: 'bg-gold/15 text-gold-soft border-gold/30' },
  Low: { dot: 'bg-mute', chip: 'bg-ink-800 text-mute border-line' },
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
    <section className="rise rounded-lg border border-line bg-ink-900/80 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm tracking-[0.25em] text-gold-soft">KALENDER EKONOMI</h2>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded px-2 py-1 text-[10px] tracking-wider transition-colors ${
                filter === f.id ? 'bg-gold/20 text-gold-soft' : 'text-mute hover:text-fg'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-mute">
        Waktu dalam WIB · klik event untuk melihat dampaknya ke XAUUSD
      </p>

      <div className="mt-3 max-h-[420px] space-y-4 overflow-y-auto pr-1">
        {grouped.length === 0 && (
          <p className="py-6 text-center text-xs text-mute">Tidak ada event dengan filter ini.</p>
        )}
        {grouped.map((g) => (
          <div key={g.key}>
            <div className="sticky top-0 z-10 bg-ink-900/95 pb-1 text-[10px] tracking-[0.18em] text-mute backdrop-blur">
              {g.label.toUpperCase()}
            </div>
            <ul className="space-y-1">
              {g.items.map((ev) => {
                const open = expanded === ev.id;
                const style = IMPACT_CHIP[ev.impact];
                return (
                  <li key={ev.id} className="rounded border border-line-soft bg-ink-850/50">
                    <button
                      onClick={() => setExpanded(open ? null : ev.id)}
                      className="flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-ink-800/60"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                      <span className="num w-11 shrink-0 pt-0.5 text-xs text-fg/80">{fmtTimeWib(ev.timestamp)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-fg">{ev.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-mute">
                          <span className={`rounded border px-1 py-px ${style.chip}`}>{ev.impact}</span>
                          <span className="rounded border border-line px-1 py-px">{ev.currency}</span>
                          {ev.forecast && <span>fcst {ev.forecast}</span>}
                          {ev.previous && <span>prev {ev.previous}</span>}
                          {ev.actual && <span className="text-gold-soft">act {ev.actual}</span>}
                          <span className={ev.timestamp > now ? 'text-fg/60' : 'text-mute'}>
                            {countdown(ev.timestamp, now)}
                          </span>
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-line-soft px-3 py-2.5 text-xs leading-relaxed">
                        <div className="flex gap-2">
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-wider ${
                            ev.gold.relevance === 'langsung' ? 'border-gold/40 bg-gold/10 text-gold-soft' : 'border-line bg-ink-800 text-mute'
                          }`}>
                            {ev.gold.relevance.toUpperCase()}
                          </span>
                          <p className="text-fg/85">{ev.gold.whyItMatters}</p>
                        </div>
                        <p className="mt-2 text-mute">
                          <span className="text-[10px] tracking-[0.15em] text-gold-soft">PROYEKSI DAMPAK</span>
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
