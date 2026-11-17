/**
 * News layer: raw ForexFactory events (via the MCP bridge) enriched with
 * gold-impact context for XAUUSD decision making.
 */
import type { NewsEvent, NewsRisk } from '../../shared/types.js';
import { callTool } from '../mcp.js';

export const CALENDAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY'];

interface RawEvent {
  title: string;
  country: string;
  date: string;
  impact: 'Low' | 'Medium' | 'High' | 'Holiday';
  forecast: string;
  previous: string;
  actual?: string;
}

interface GoldRule {
  re: RegExp;
  /** What the event measures and why gold traders watch it. */
  what: string;
  /** Directional logic for a strong-vs-forecast print (USD relevance). */
  effectUsd: string;
}

const STRONG_USD_EFFECT =
  'Data lebih kuat dari forecast biasanya menguatkan USD → XAUUSD tertekan; data lebih lemah → XAUUSD cenderung menguat.';

const RULES: GoldRule[] = [
  {
    re: /non.?farm|\bnfp\b|employment change|job creation|payroll/i,
    what: 'Laporan tenaga kerja AS — indikator utama kesehatan ekonomi dan arah kebijakan The Fed.',
    effectUsd: STRONG_USD_EFFECT,
  },
  {
    re: /\bcpi\b|consumer price/i,
    what: 'Inflasi konsumen AS — ukuran utama yang dipantau The Fed untuk menentukan suku bunga.',
    effectUsd: 'Inflasi lebih panas dari ekspektasi → ekspektasi suku bunga naik → XAUUSD tertekan; inflasi lebih dingin → XAUUSD cenderung menguat.',
  },
  {
    re: /\bpce\b|personal consumption/i,
    what: 'Inflasi PCE — ukuran inflasi favorit The Fed untuk kebijakan moneter.',
    effectUsd: 'Sama seperti CPI: bacaan panas menekan XAUUSD, bacaan dingin mendukung kenaikan.',
  },
  {
    re: /\bppi\b|producer price/i,
    what: 'Inflasi produsen — indikator awal tekanan harga yang akan diteruskan ke konsumen.',
    effectUsd: STRONG_USD_EFFECT,
  },
  {
    re: /fomc|rate statement|interest rate|fed funds|monetary policy/i,
    what: 'Keputusan dan pernyataan suku bunga The Fed — faktor tunggal terbesar penentu harga emas.',
    effectUsd: 'Kenaikan suku bunga atau nada hawkish menekan XAUUSD (imbal hasil dolar naik); pemotongan atau nada dovish mendukung kenaikan XAUUSD.',
  },
  {
    re: /powell|fed chair|fomc member|fed speak/i,
    what: 'Pernyataan pejabat The Fed yang mengubah ekspektasi kebijakan moneter.',
    effectUsd: 'Nada hawkish menekan XAUUSD; nada dovish mendukung kenaikan XAUUSD.',
  },
  {
    re: /retail sales/i,
    what: 'Belanja ritel konsumen AS — mesin utama pertumbuhan ekonomi AS.',
    effectUsd: STRONG_USD_EFFECT,
  },
  {
    re: /\bpmi\b|\bism\b|purchasing managers/i,
    what: 'Indikator awal aktivitas manufaktur/jasa (PMI & ISM).',
    effectUsd: 'Bacaan di atas ekspektasi → ekonomi kuat → USD menguat → XAUUSD tertekan; di bawah ekspektasi → sebaliknya.',
  },
  {
    re: /\bgdp\b|gross domestic/i,
    what: 'Pertumbuhan ekonomi agregat.',
    effectUsd: STRONG_USD_EFFECT,
  },
  {
    re: /jobless claims|unemployment/i,
    what: 'Kondisi pasar tenaga kerja (klaim pengangguran / tingkat pengangguran).',
    effectUsd: 'Klaim turun / lapangan kerja bertambah → USD menguat → XAUUSD tertekan; klaim naik → XAUUSD cenderung menguat.',
  },
  {
    re: /consumer sentiment|consumer confidence|uom|\bzew\b|gfk/i,
    what: 'Keyakinan konsumen — proyeksi belanja ke depan.',
    effectUsd: STRONG_USD_EFFECT,
  },
  {
    re: /\badp\b/i,
    what: 'Estimasi lapangan kerja swasta AS — sering jadi prelude menjelang NFP.',
    effectUsd: STRONG_USD_EFFECT,
  },
  {
    re: /treasury|auction|bond yield|10-year|10 year/i,
    what: 'Imbal hasil / lelang obligasi AS — bersaing langsung dengan emas yang tidak memberikan yield.',
    effectUsd: 'Yield naik → XAUUSD tertekan; yield turun → XAUUSD mendapat dukungan.',
  },
  {
    re: /trade balance|current account|exports|imports/i,
    what: 'Neraca perdagangan — permintaan terhadap dolar.',
    effectUsd: STRONG_USD_EFFECT,
  },
];

const GENERIC_USD: GoldRule = {
  re: /.*/,
  what: 'Data ekonomi AS yang memengaruhi ekspektasi kebijakan The Fed.',
  effectUsd: STRONG_USD_EFFECT,
};

function findRule(title: string): GoldRule {
  return RULES.find((rule) => rule.re.test(title)) ?? GENERIC_USD;
}

export function enrichEvent(raw: RawEvent, index: number): NewsEvent {
  const currency = raw.country.toUpperCase();
  const isUsd = currency === 'USD';
  const rule = findRule(raw.title);
  return {
    id: `${currency}-${Math.floor(Date.parse(raw.date) / 1000)}-${index}`,
    title: raw.title,
    currency,
    date: raw.date,
    timestamp: Math.floor(Date.parse(raw.date) / 1000),
    impact: raw.impact === 'High' || raw.impact === 'Medium' ? raw.impact : 'Low',
    forecast: raw.forecast ?? '',
    previous: raw.previous ?? '',
    actual: raw.actual ?? '',
    gold: isUsd
      ? { relevance: 'langsung', whyItMatters: rule.what, typicalEffect: rule.effectUsd }
      : {
          relevance: 'tidak langsung',
          whyItMatters: `${rule.what} Dampak ke XAUUSD tidak langsung — berjalan via indeks dolar (DXY) dan selera risiko global.`,
          typicalEffect: 'Reaksi XAUUSD biasanya lebih terbatas dibanding berita USD; arah mengikuti respons DXY terhadap data ini.',
        },
  };
}

export interface CalendarWindow {
  /** Hours of history to keep (released events with actual values). */
  hoursBehind?: number;
  /** Hours ahead to include. */
  hoursAhead?: number;
}

export async function fetchCalendar(window: CalendarWindow = {}): Promise<NewsEvent[]> {
  const hoursBehind = window.hoursBehind ?? 6;
  const hoursAhead = window.hoursAhead ?? 24 * 8;
  const nowSec = Math.floor(Date.now() / 1000);

  // A dead calendar feed must not take the whole analysis down: the gate is a
  // filter, so its absence degrades to "no news events" and a warning.
  let raw: RawEvent[] = [];
  try {
    const { data } = await callTool<{ count: number; events: RawEvent[] }>('get_economic_calendar', {
      currencies: CALENDAR_CURRENCIES,
      min_importance: -1,
    });
    raw = data.events ?? [];
  } catch (err) {
    console.error('[news] calendar unavailable:', err instanceof Error ? err.message : err);
  }

  return raw
    .map(enrichEvent)
    .filter((ev) => !Number.isNaN(ev.timestamp))
    .filter((ev) => ev.timestamp >= nowSec - hoursBehind * 3600 && ev.timestamp <= nowSec + hoursAhead * 3600)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function countdownText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}j ${rest}m` : `${hours} jam`;
}

/** News gate for entries: high-impact events near "now" force a wait.
 *  `windowSec` widens the blackout; scalping only needs the release itself. */
export function assessNewsRisk(events: NewsEvent[], nowSec: number, windowSec = 3600): NewsRisk {
  const nextHighImpact =
    events.find((ev) => ev.impact === 'High' && ev.timestamp > nowSec - Math.min(5 * 60, windowSec)) ?? null;
  if (!nextHighImpact) {
    return {
      level: 'none',
      note: 'Tidak ada rilis high-impact dalam waktu dekat — jendela entry relatif aman.',
      nextHighImpact: null,
    };
  }

  const delta = nextHighImpact.timestamp - nowSec;
  const when = delta > 0 ? `dalam ${countdownText(delta)}` : `baru saja dirilis (${countdownText(-delta)} lalu)`;
  const label = `"${nextHighImpact.title}" (${nextHighImpact.currency}, ${nextHighImpact.impact})`;

  if (Math.abs(delta) <= windowSec) {
    return {
      level: 'high',
      note: `Hindari entry baru dekat rilis ${label} ${when} — spread melebar dan candle bisa wick liar.`,
      nextHighImpact,
    };
  }
  return {
    level: 'caution',
    note: `Rilis ${label} ${when}. Entry masih memungkinkan, tapi kecilkan risiko dan antisipasi spike volatilitas.`,
    nextHighImpact,
  };
}
