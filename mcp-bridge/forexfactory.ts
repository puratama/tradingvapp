/**
 * ForexFactory economic calendar feed (free JSON, no auth).
 * Merged from this-week and next-week files; fields are raw as published.
 */

const FEED_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
] as const;

export interface FfEvent {
  title: string;
  country: string;
  /** ISO timestamp with UTC offset, e.g. "2026-11-12T08:30:00-05:00". */
  date: string;
  impact: 'Low' | 'Medium' | 'High' | 'Holiday';
  forecast: string;
  previous: string;
  actual?: string;
}

export interface CalendarFilter {
  currencies?: string[];
  /** -1 all, 0 medium+high, 1 high only. */
  minImportance?: number;
  dateFrom?: string;
  dateTo?: string;
}

function parseTs(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function passesImpact(impact: FfEvent['impact'], minImportance: number): boolean {
  if (minImportance < 0) return impact !== 'Holiday';
  if (minImportance === 0) return impact === 'Medium' || impact === 'High';
  return impact === 'High';
}

export async function fetchEconomicCalendar(filter: CalendarFilter = {}): Promise<FfEvent[]> {
  const settled = await Promise.allSettled(
    FEED_URLS.map(async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`ForexFactory feed ${res.status}: ${url}`);
      return (await res.json()) as FfEvent[];
    }),
  );
  const bodies = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (bodies.length === 0) {
    const detail = settled
      .map((r) => (r.status === 'rejected' ? String(r.reason) : ''))
      .filter(Boolean)
      .join('; ');
    throw new Error(`ForexFactory feeds unavailable: ${detail}`);
  }

  const fromTs = filter.dateFrom ? parseTs(filter.dateFrom) : undefined;
  const toTs = filter.dateTo ? parseTs(filter.dateTo) : undefined;
  const currencies = filter.currencies?.map((c) => c.toUpperCase());
  const minImportance = filter.minImportance ?? -1;

  return bodies
    .flat()
    .filter((ev) => passesImpact(ev.impact, minImportance))
    .filter((ev) => !currencies || currencies.includes(ev.country.toUpperCase()))
    .filter((ev) => {
      const ts = parseTs(ev.date);
      if (Number.isNaN(ts)) return false;
      if (fromTs !== undefined && ts < fromTs) return false;
      if (toTs !== undefined && ts > toTs) return false;
      return true;
    })
    .sort((a, b) => parseTs(a.date) - parseTs(b.date));
}
