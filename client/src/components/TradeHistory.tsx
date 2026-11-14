import type { TradeRecord } from '../../../shared/types';
import { fmtDateWib, fmtNum, fmtPrice, fmtTimeWib } from '../lib/format';

const STATUS_CHIP: Record<TradeRecord['status'], { label: string; chip: string }> = {
  WAITING: { label: 'MENUNGGU ENTRY', chip: 'bg-ink-800 text-mute border-line' },
  RUNNING: { label: 'BERJALAN', chip: 'bg-warn/15 text-warn border-warn/30' },
  TP_HIT: { label: 'TAKE PROFIT', chip: 'bg-up/15 text-up border-up/30' },
  SL_HIT: { label: 'STOP LOSS', chip: 'bg-down/15 text-down border-down/30' },
  EXPIRED: { label: 'KEDALUWARSA', chip: 'bg-ink-800 text-mute border-line' },
};

/** Full trade detail for the modal — never collapsed. */
export function TradeDetail({ trade: t }: { trade: TradeRecord }) {
  const chip = STATUS_CHIP[t.status];
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] tracking-wider ${
            t.direction === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
          }`}
        >
          {t.direction}
        </span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] tracking-wider ${chip.chip}`}>{chip.label}</span>
        <span className="text-mute">
          {fmtDateWib(t.createdAt)} · {fmtTimeWib(t.createdAt)} WIB
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PriceBox label="ENTRY" value={t.entry} />
        <PriceBox label="STOP LOSS" value={t.sl} />
        <PriceBox label="TAKE PROFIT 1" value={t.tp1} />
        <PriceBox label="TAKE PROFIT 2" value={t.tp2} />
      </div>

      <p className="text-mute">
        Eksekusi: <span className="text-fg/80">{t.action.label}</span> — {t.action.note}
      </p>
      <p className="text-mute">
        Setup <span className="text-fg/80">{t.setupType}</span> · confidence{' '}
        <span className="num text-fg/80">{fmtNum(t.confidence)}%</span>
      </p>

      {t.status === 'WAITING' && (
        <p className="rounded border border-line bg-ink-850/50 px-2 py-1.5 text-mute">
          Menunggu harga menyentuh entry {fmtPrice(t.entry)} · batal otomatis bila tak tersentuh dalam 1 jam.
        </p>
      )}
      {t.status === 'EXPIRED' && t.closedAt !== null && (
        <p className="rounded border border-line bg-ink-850/50 px-2 py-1.5 text-mute">
          Entry tak tersentuh dalam 1 jam · dibatalkan {fmtTimeWib(t.closedAt)} WIB.
        </p>
      )}
      {(t.status === 'TP_HIT' || t.status === 'SL_HIT') && t.exitPrice !== null && t.closedAt !== null && (
        <p className="rounded border border-line bg-ink-850/50 px-2 py-1.5 text-mute">
          Exit {fmtPrice(t.exitPrice)} · ditutup {fmtDateWib(t.closedAt)} {fmtTimeWib(t.closedAt)} WIB.
        </p>
      )}

      <div>
        <h3 className="text-[10px] tracking-[0.22em] text-mute">ALASAN KEPUTUSAN</h3>
        <ul className="mt-2 space-y-1.5">
          {t.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 leading-relaxed text-fg/85">
              <span className="mt-0.5 text-gold">▸</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PriceBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded border border-line-soft bg-ink-850/60 px-2 py-1.5">
      <div className="text-[10px] tracking-[0.18em] text-mute">{label}</div>
      <div className="num text-sm text-fg">{fmtPrice(value)}</div>
    </div>
  );
}

export default function TradeHistory({ trades, onSelect }: { trades: TradeRecord[]; onSelect: (trade: TradeRecord) => void }) {

  return (
    <section className="rise p-3">
      <p className="text-[10px] leading-relaxed text-mute">
        Sinyal BUY/SELL tercatat otomatis · status dari harga real-time (TP = tp1) · klik untuk detail lengkap
      </p>

      <div className="mt-2 space-y-1.5">
        {trades.length === 0 && (
          <p className="py-6 text-center text-xs text-mute">Belum ada sinyal yang tercatat.</p>
        )}
        {trades.map((t) => {
          const chip = STATUS_CHIP[t.status];
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="w-full rounded border border-line-soft bg-ink-850/50 px-2 py-1.5 text-left text-xs transition-colors hover:border-line"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
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
              </div>
              <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fg/80">
                <span>E {fmtPrice(t.entry)}</span>
                <span>SL {fmtPrice(t.sl)}</span>
                <span>TP {fmtPrice(t.tp1)}</span>
              </div>
              <div className="mt-1">
                <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] tracking-wider ${chip.chip}`}>
                  {chip.label}
                </span>
              </div>
              {(t.status === 'WAITING' || t.status === 'EXPIRED') && (
                <p className="mt-1 text-[11px] text-mute">
                  {t.status === 'WAITING'
                    ? `Menunggu entry ${fmtPrice(t.entry)} · batal otomatis dalam 1 jam`
                    : `Entry tak tersentuh · dibatalkan ${fmtTimeWib(t.closedAt ?? t.createdAt)} WIB`}
                </p>
              )}
              {(t.status === 'TP_HIT' || t.status === 'SL_HIT') && t.exitPrice !== null && t.closedAt !== null && (
                <p className="mt-1 text-[11px] text-mute">
                  Exit {fmtPrice(t.exitPrice)} · ditutup {fmtTimeWib(t.closedAt)} WIB · confidence{' '}
                  {fmtNum(t.confidence)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
