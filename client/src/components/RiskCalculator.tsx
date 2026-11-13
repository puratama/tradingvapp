import { useState } from 'react';
import type { TradePlan } from '../../../shared/types';
import { fmtPrice } from '../lib/format';

/** XAUUSD standard contract: 100 troy ounce per lot. */
const OZ_PER_LOT = 100;

export default function RiskCalculator({ plan }: { plan: TradePlan }) {
  const [balance, setBalance] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);

  const stopDistance = plan.stopDistance;
  const riskUsd = (balance * riskPct) / 100;
  const lots = stopDistance && stopDistance > 0 ? riskUsd / (stopDistance * OZ_PER_LOT) : 0;
  const units = lots * OZ_PER_LOT;

  return (
    <section className="rise rounded-lg border border-line bg-ink-900/80 p-4">
      <h2 className="font-display text-sm tracking-[0.25em] text-gold-soft">KALKULATOR RISIKO</h2>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] tracking-[0.15em] text-mute">MODAL (USD)</span>
          <input
            type="number"
            min={1}
            step={100}
            value={balance}
            onChange={(e) => setBalance(Math.max(1, Number(e.target.value) || 0))}
            className="num mt-1 w-full rounded border border-line bg-ink-850 px-2 py-1.5 text-sm text-fg outline-none focus:border-gold/60"
          />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-[0.15em] text-mute">RISIKO (%)</span>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={riskPct}
            onChange={(e) => setRiskPct(Math.min(10, Math.max(0.1, Number(e.target.value) || 0)))}
            className="num mt-1 w-full rounded border border-line bg-ink-850 px-2 py-1.5 text-sm text-fg outline-none focus:border-gold/60"
          />
        </label>
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between border-t border-line-soft pt-1.5">
          <dt className="text-mute">Risiko per trade</dt>
          <dd className="num text-fg">${riskUsd.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between border-t border-line-soft pt-1.5">
          <dt className="text-mute">Jarak stop loss</dt>
          <dd className="num text-fg">{stopDistance ? `$${stopDistance.toFixed(2)} / oz` : '—'}</dd>
        </div>
        <div className="flex justify-between border-t border-line-soft pt-1.5">
          <dt className="text-mute">Ukuran posisi</dt>
          <dd className="num text-lg text-gold-soft">
            {lots > 0 ? `${lots >= 0.01 ? lots.toFixed(2) : lots.toFixed(4)} lot` : '—'}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line-soft pt-1.5">
          <dt className="text-mute">Setara ounce</dt>
          <dd className="num text-fg/80">{lots > 0 ? `${units.toFixed(1)} oz` : '—'}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[10px] leading-relaxed text-mute">
        Kontrak XAUUSD standar = {OZ_PER_LOT} oz/lot, sehingga pergerakan $1/oz bernilai $100 per lot. Posisi dihitung dari
        jarak SL rencana entry {plan.entry !== null ? `(entry ${fmtPrice(plan.entry)})` : ''} agar risiko sesuai persentase modal.
      </p>
    </section>
  );
}
