import { useState } from 'react';
import type { TradePlan } from '../../../shared/types';
import { fmtPrice } from '../lib/format';
import { NUM } from '../ui/styles';

/** XAUUSD standard contract: 100 troy ounce per lot. */
const OZ_PER_LOT = 100;

const INPUT =
  'num mt-1 h-8 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg transition-colors outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export default function RiskCalculator({ plan }: { plan: TradePlan }) {
  const [balance, setBalance] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);

  // Spread adds to the stop: you pay it once on entry, so the effective risk
  // per ounce is stop distance + spread, not the stop alone.
  const stopDistance = plan.stopDistance;
  const costPerOz = stopDistance !== null ? stopDistance + (plan.spread ?? 0) : null;
  const riskUsd = (balance * riskPct) / 100;
  const lots = costPerOz && costPerOz > 0 ? riskUsd / (costPerOz * OZ_PER_LOT) : 0;
  const units = lots * OZ_PER_LOT;

  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Risiko per trade', value: `$${riskUsd.toFixed(2)}` },
    {
      label: 'Jarak SL + spread',
      value: costPerOz ? `$${costPerOz.toFixed(2)} / oz` : '—',
    },
    { label: 'Ukuran posisi', value: lots > 0 ? `${lots >= 0.01 ? lots.toFixed(2) : lots.toFixed(4)} lot` : '—', strong: true },
    { label: 'Setara ounce', value: lots > 0 ? `${units.toFixed(1)} oz` : '—' },
  ];

  return (
    <section className="rise">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted">Modal (USD)</span>
          <input
            type="number"
            min={1}
            step={100}
            value={balance}
            onChange={(e) => setBalance(Math.max(1, Number(e.target.value) || 0))}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted">Risiko (%)</span>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={riskPct}
            onChange={(e) => setRiskPct(Math.min(10, Math.max(0.1, Number(e.target.value) || 0)))}
            className={INPUT}
          />
        </label>
      </div>

      <dl className="mt-3 divide-y divide-line rounded-md border border-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-3 py-2">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className={`${NUM} ${r.strong ? 'text-base font-semibold text-accent' : 'text-sm text-fg'}`}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-2xs leading-relaxed text-muted">
        Kontrak XAUUSD standar = {OZ_PER_LOT} oz/lot, sehingga pergerakan $1/oz bernilai $100 per lot. Posisi dihitung
        dari jarak SL rencana entry {plan.entry !== null ? `(${fmtPrice(plan.entry)})` : ''} agar risiko sesuai
        persentase modal.
      </p>
    </section>
  );
}
