/** Formatting helpers: WIB timestamps, countdowns, prices. */

const WIB = 'Asia/Jakarta';

const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric', month: '2-digit', day: '2-digit' });

export function fmtTimeWib(ts: number): string {
  return timeFmt.format(new Date(ts * 1000));
}

export function fmtDateWib(ts: number): string {
  return dateFmt.format(new Date(ts * 1000));
}

export function dayKey(ts: number): string {
  return dayKeyFmt.format(new Date(ts * 1000));
}

export function fmtDayLabel(ts: number, nowTs: number): string {
  const key = dayKey(ts);
  if (key === dayKey(nowTs)) return 'Hari ini';
  if (key === dayKey(nowTs + 86_400)) return 'Besok';
  return fmtDateWib(ts);
}

const priceFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtPrice(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : priceFmt.format(v);
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits);
}

/** Compact countdown: "45m", "2j 15m", "LIVE", "selesai 10m lalu". */
export function countdown(ts: number, nowTs: number): string {
  const delta = ts - nowTs;
  const minutes = Math.round(Math.abs(delta) / 60);
  if (Math.abs(delta) <= 60) return 'LIVE';
  const text = minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}j ${minutes % 60 ? `${minutes % 60}m` : ''}`.trim();
  return delta > 0 ? text : `selesai ${text} lalu`;
}
