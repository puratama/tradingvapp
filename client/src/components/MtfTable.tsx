import type { TfSnapshot } from '../../../shared/types';
import { fmtNum, fmtPrice } from '../lib/format';

const TRENT_CHIP: Record<TfSnapshot['trend'], string> = {
  UP: 'bg-up/15 text-up',
  DOWN: 'bg-down/15 text-down',
  RANGE: 'bg-ink-800 text-mute',
};

const TRENT_LABEL: Record<TfSnapshot['trend'], string> = {
  UP: 'NAIK',
  DOWN: 'TURUN',
  RANGE: 'RANGE',
};

export default function MtfTable({ mtf }: { mtf: TfSnapshot[] }) {
  return (
    <section className="rise rounded-lg border border-line bg-ink-900/80 p-4">
      <h2 className="font-display text-sm tracking-[0.25em] text-gold-soft">KONDISI MULTI-TIMEFRAME</h2>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] tracking-[0.15em] text-mute">
            <th className="pb-2 font-medium">TF</th>
            <th className="pb-2 font-medium">TREN</th>
            <th className="pb-2 text-right font-medium">SKOR</th>
            <th className="pb-2 text-right font-medium">RSI</th>
            <th className="pb-2 text-right font-medium">EMA20</th>
            <th className="pb-2 text-right font-medium">MACD HIST</th>
            <th className="pb-2 text-right font-medium">ATR</th>
          </tr>
        </thead>
        <tbody>
          {mtf.map((s) => (
            <tr key={s.tf} className="border-t border-line-soft">
              <td className="py-2 font-medium text-fg">{s.tf}</td>
              <td className="py-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] tracking-wider ${TRENT_CHIP[s.trend]}`}>
                  {TRENT_LABEL[s.trend]}
                </span>
              </td>
              <td className={`num py-2 text-right ${s.trendScore > 0 ? 'text-up' : s.trendScore < 0 ? 'text-down' : 'text-mute'}`}>
                {s.trendScore >= 0 ? '+' : ''}{s.trendScore.toFixed(2)}
              </td>
              <td className={`num py-2 text-right ${s.rsi > 70 ? 'text-down' : s.rsi < 30 ? 'text-up' : 'text-fg/80'}`}>
                {fmtNum(s.rsi, 1)}
              </td>
              <td className="num py-2 text-right text-fg/80">{fmtPrice(s.ema20)}</td>
              <td className={`num py-2 text-right ${s.macdHist > 0 ? 'text-up' : 'text-down'}`}>{fmtNum(s.macdHist, 2)}</td>
              <td className="num py-2 text-right text-fg/80">{fmtPrice(s.atr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] leading-relaxed text-mute">
        Skor tren: rata-rata berbobot (D1:H4:H1:M15:M5 = 3:3:2:1:1) dari keselarasan EMA20/50/200, posisi harga terhadap EMA50,
        dan struktur swing (HH/HL vs LH/LL).
      </p>
    </section>
  );
}
