import type { LucideIcon } from 'lucide-react';

export type IconSize = 14 | 16 | 18 | 20;

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
  /** Omit for decorative icons (hidden from AT). */
  label?: string;
}

/** One stroke width everywhere: 1.75. */
export function Icon({ icon: Cmp, size = 16, className = '', label }: IconProps) {
  return (
    <Cmp
      size={size}
      strokeWidth={1.75}
      className={`shrink-0 ${className}`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
