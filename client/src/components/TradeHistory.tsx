import type { TradeRecord } from '../../../shared/types';
import { fmtDateWib, fmtNum, fmtPrice, fmtTimeWib } from '../lib/format';
import { Chip, type Tone } from '../ui/Chip';
import { NUM } from '../ui/styles';

const STATUS: Record<TradeRecord['status'], { label: string; tone: Tone }> = {
  WAITING: { label: 'Menunggu entry', tone: 'neutral' },
  RUNNING: { label: 'Berjalan', tone: 'warn' },
  TP_HIT: { label: 'Take profit', tone: 'bull' },
  SL_HIT: { label: 'Stop loss', tone: 'bear' },
  EXPIRED: { label: 'Kedaluwarsa', tone: 'neutral' },
};

function PriceBox({ label, value, toneClass = 'text-fg' }: { label: string; value: number | null; toneClass?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
      <div className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`${NUM} text-sm font-semibold ${toneClass}`}>{fmtPrice(value)}</div>
    </div>
  );
}

/** Full trade detail for the modal — never collapsed. */
export function TradeDetail({ trade: t }: { trade: TradeRecord }) {
  const chip = STATUS[t.status];
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={t.direction === 'BUY' ? 'bull' : 'bear'}>{t.direction}</Chip>
        <Chip tone={chip.tone}>{chip.label}</Chip>
        <span className="text-muted">{t.setupType}</span>
        <span className="ml-auto text-muted">
          Konfluensi <span className={`${NUM} text-fg`}>{fmtNum(t.confidence)}%</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PriceBox label="Entry" value={t.entry} />
        <PriceBox label="Stop loss" value={t.sl} toneClass="text-bear" />
        <PriceBox label="Take profit" value={t.tp1} toneClass="text-bull" />
        <PriceBox label="Exit" value={t.exitPrice} />
      </div>

      <p className="text-muted">
        Eksekusi: <span className="text-fg/80">{t.action.label}</span> — {t.action.note}
      </p>
      <p className="text-muted">
        Dibuat {fmtDateWib(t.createdAt)} · {fmtTimeWib(t.createdAt)} WIB
      </p>

      {t.status === 'WAITING' && (
        <p className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-muted">
          Menunggu harga menyentuh entry {fmtPrice(t.entry)} · batal otomatis bila tak tersentuh dalam 1 jam.
        </p>
      )}
      {t.status === 'EXPIRED' && t.closedAt !== null && (
        <p className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-muted">
          Entry tak tersentuh dalam 1 jam · dibatalkan {fmtTimeWib(t.closedAt)} WIB.
        </p>
      )}
      {(t.status === 'TP_HIT' || t.status === 'SL_HIT') && t.exitPrice !== null && t.closedAt !== null && (
        <p className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-muted">
          Exit {fmtPrice(t.exitPrice)} · ditutup {fmtDateWib(t.closedAt)} {fmtTimeWib(t.closedAt)} WIB.
        </p>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Alasan saat sinyal</h3>
        <ul className="mt-2 space-y-1.5">
          {t.reasons.map((r) => (
            <li key={r} className="flex gap-2 leading-relaxed text-fg/80">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function TradeHistory({ trades, onSelect }: { trades: TradeRecord[]; onSelect: (trade: TradeRecord) => void }) {
  return (
    <section className="rise">
      <p className="text-2xs leading-relaxed text-muted">
        Sinyal BUY/SELL tercatat otomatis · status dari harga real-time (TP = TP1) · klik untuk detail
      </p>

      <div className="mt-2 divide-y divide-line rounded-md border border-line">
        {trades.length === 0 && <p className="py-6 text-center text-xs text-muted">Belum ada sinyal yang tercatat.</p>}
        {trades.map((t) => {
          const chip = STATUS[t.status];
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="block w-full px-2.5 py-2 text-left transition-colors first:rounded-t-md last:rounded-b-md hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Chip tone={t.direction === 'BUY' ? 'bull' : 'bear'}>{t.direction}</Chip>
                  <Chip tone={chip.tone}>{chip.label}</Chip>
                </span>
                <span className={`${NUM} text-2xs text-muted`}>{fmtTimeWib(t.createdAt)} WIB</span>
              </div>
              <div className={`${NUM} mt-1.5 flex gap-x-3 text-xs text-fg/80`}>
                <span>
                  E <span className="font-medium text-fg">{fmtPrice(t.entry)}</span>
                </span>
                <span>
                  SL <span className="text-bear">{fmtPrice(t.sl)}</span>
                </span>
                <span>
                  TP <span className="text-bull">{fmtPrice(t.tp1)}</span>
                </span>
              </div>
              {(t.status === 'WAITING' || t.status === 'EXPIRED') && (
                <p className="mt-1 text-2xs text-muted">
                  {t.status === 'WAITING'
                    ? 'Menunggu entry · batal otomatis dalam 1 jam'
                    : `Entry tak tersentuh · dibatalkan ${fmtTimeWib(t.closedAt ?? t.createdAt)} WIB`}
                </p>
              )}
              {(t.status === 'TP_HIT' || t.status === 'SL_HIT') && t.exitPrice !== null && t.closedAt !== null && (
                <p className="mt-1 text-2xs text-muted">
                  Exit <span className={`${NUM} text-fg/70`}>{fmtPrice(t.exitPrice)}</span> · ditutup{' '}
                  {fmtTimeWib(t.closedAt)} WIB · konfluensi{' '}
                  <span className={`${NUM} text-fg/70`}>{fmtNum(t.confidence)}%</span>
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
