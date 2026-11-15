import type { ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './styles';
import { Icon, type IconProps } from './Icon';

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconProps['icon'];
  /** Icon-only buttons: accessible name (also used as tooltip). */
  label?: string;
  /** Toggle semantics; flips variant between ghost and selected. */
  pressed?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function Button({
  children,
  variant = 'ghost',
  size = 'md',
  icon,
  label,
  pressed,
  className = '',
  onClick,
  disabled,
}: ButtonProps) {
  const v: ButtonVariant = pressed === undefined ? variant : pressed ? 'selected' : 'ghost';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={buttonClass(v, size, className)}
    >
      {icon && <Icon icon={icon} size={size === 'lg' ? 16 : 14} />}
      {children}
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: IconProps['icon'];
}

/** Single-choice control (timeframes, side tabs, news filters). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'sm',
  className = '',
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex items-center gap-0.5 ${className}`}>
      {options.map((o) => (
        <Button key={o.id} size={size} icon={o.icon} pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}
