import type { LucideIcon } from 'lucide-react';

/** Component class recipes — the only place raw utility strings for UI shell live. */

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface';

export const BTN_BASE = `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors ${FOCUS} disabled:pointer-events-none disabled:opacity-50`;

export const BTN_VARIANT = {
  /** Neutral toolbar/action button. */
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  /** Toggle in its active state (timeframe, tab, filter). */
  selected: 'bg-accent-soft text-accent-strong',
  primary: 'bg-accent text-white hover:bg-accent-strong',
  outline: 'border border-line text-fg hover:border-line-strong hover:bg-surface-2',
} as const;

export const BTN_SIZE = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-8 px-2.5 text-xs',
  lg: 'h-9 px-3.5 text-sm',
  icon: 'h-7 w-7',
} as const;

export type ButtonVariant = keyof typeof BTN_VARIANT;
export type ButtonSize = keyof typeof BTN_SIZE;

const SIZE_PX: Record<ButtonSize, 14 | 16 | 18> = { sm: 14, md: 14, lg: 16, icon: 16 };

export function buttonClass(variant: ButtonVariant = 'ghost', size: ButtonSize = 'md', extra = ''): string {
  return `${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${extra}`;
}

/** Icon size that stays proportional to the button it sits in. */
export function buttonIconSize(size: ButtonSize): number {
  return SIZE_PX[size];
}


/** Section heading: 12px, weight 600, muted, uppercase tracking. */
export const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-[0.08em] text-muted';


/** Monospace figure typography. */
export const NUM = 'num tabular-nums';
