import type { ReactNode } from 'react';
import { NUM } from './styles';

export type Tone = 'neutral' | 'bull' | 'bear' | 'warn' | 'info' | 'accent';

const CHIP: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-muted border-line',
  bull: 'bg-bull-soft text-bull border-bull/20',
  bear: 'bg-bear-soft text-bear border-bear/20',
  warn: 'bg-warn-soft text-warn border-warn/20',
  info: 'bg-info-soft text-info border-info/20',
  accent: 'bg-accent-soft text-accent-strong border-accent/20',
};

const TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  bull: 'text-bull',
  bear: 'text-bear',
  warn: 'text-warn',
  info: 'text-info',
  accent: 'text-accent',
};

const DOT: Record<Tone, string> = {
  neutral: 'bg-neutral',
  bull: 'bg-bull',
  bear: 'bg-bear',
  warn: 'bg-warn',
  info: 'bg-info',
  accent: 'bg-accent',
};

export function tone(t: Tone): string {
  return TEXT[t];
}

/** Small status/label badge. 11px, uppercase, medium. */
export function Chip({ tone: t = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-2xs font-medium uppercase tracking-wide whitespace-nowrap ${CHIP[t]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Status dot; pulse only for live indicators. */
export function Dot({ tone: t = 'bull', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${DOT[t]} ${pulse ? 'live-dot' : ''}`} aria-hidden />;
}

/**
 * Figure with a label — the core data unit of the app.
 * `size="hero"` is reserved for the decision verdict / headline price.
 */
export function Stat({
  label,
  value,
  hint,
  tone: t = 'neutral',
  size = 'sm',
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}) {
  const valueSize = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    hero: 'text-3xl',
  }[size];
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="truncate text-2xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`${NUM} ${valueSize} font-semibold leading-tight ${tone(t)}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-2xs font-normal text-muted">{hint}</div>}
    </div>
  );
}
