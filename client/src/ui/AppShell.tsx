import { useState, type ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FOCUS } from './styles';
import Button from './Button';
import { Icon } from './Icon';

export interface NavItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Right-aligned count/badge (only rendered when expanded). */
  /** Plain count shown on the right when the nav is expanded. */
  badge?: number;
}

export interface NavGroup<T extends string> {
  label: string;
  items: NavItem<T>[];
}

interface AppShellProps<T extends string> {
  /** Topbar content: identity on the left, live stats in the middle, utilities on the right. */
  topbar: ReactNode;
  groups: NavGroup<T>[];
  active: T;
  onNavigate: (id: T) => void;
  ariaLabel: string;
  /** Full-bleed work area (chart). */
  children: ReactNode;
}

/**
 * App chrome: topbar + left nav.
 *
 * The nav is a 60px icon rail. Opening it is an overlay (`fixed`, widened), so
 * the chart keeps its width either way: hover shows labels temporarily, the
 * topbar button pins it open. Below `nav` it becomes a drawer.
 */
export default function AppShell<T extends string>({
  topbar,
  groups,
  active,
  onNavigate,
  ariaLabel,
  children,
}: AppShellProps<T>) {
  const [drawer, setDrawer] = useState(false);
  const [pinned, setPinned] = useState(false);

  const items = (expanded: string, iconOnly: boolean) => (
    <>
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          <span className={`px-2.5 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-faint ${expanded}`}>
            {g.label}
          </span>
          {g.items.map((it) => {
            const on = it.id === active;
            return (
              <button
                key={it.id}
                onClick={() => {
                  onNavigate(it.id);
                  setDrawer(false);
                }}
                aria-current={on ? 'page' : undefined}
                aria-label={it.label}
                title={it.label}
                className={`relative flex h-9 items-center overflow-hidden rounded-md text-xs transition-colors ${FOCUS} ${
                  iconOnly ? 'w-9 justify-center px-0 group-hover/rail:w-full group-hover/rail:justify-start group-hover/rail:gap-2.5 group-hover/rail:px-2.5' : 'w-full gap-2.5 px-2.5'
                } whitespace-nowrap ${on ? 'bg-accent-soft font-medium text-accent-strong' : 'font-normal text-muted hover:bg-surface-2 hover:text-fg'}`}
              >
                {on && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-accent" aria-hidden />}
                <Icon icon={it.icon} size={18} className={on ? 'text-accent' : ''} />
                <span className={`truncate ${expanded}`}>{it.label}</span>
                {it.badge && (
                  <span className={`ml-auto text-2xs tabular-nums text-faint ${expanded}`}>{it.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <div className="flex h-[var(--spacing-header)] shrink-0 items-center border-b border-line bg-surface pl-2 pr-3">
        <Button size="icon" icon={Menu} label="Buka menu" onClick={() => setDrawer(true)} className="nav:hidden" />
        <Button
          size="icon"
          icon={pinned ? PanelLeftClose : PanelLeftOpen}
          label={pinned ? 'Ringkas sidebar' : 'Perluas sidebar'}
          pressed={pinned}
          onClick={() => setPinned(!pinned)}
          className="hidden nav:inline-flex"
        />
        <div className="ml-2 flex min-w-0 flex-1 items-center">{topbar}</div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Fixed-width spacer: layout width never depends on the rail state. */}
        <div className="hidden w-[var(--spacing-rail)] shrink-0 nav:block" aria-hidden />

        <aside
          className={`group/rail fixed bottom-0 left-0 top-[var(--spacing-header)] z-30 hidden flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-150 nav:flex ${
            pinned
              ? 'w-[var(--spacing-rail-lg)] shadow-lg'
              : 'w-[var(--spacing-rail)] hover:w-[var(--spacing-rail-lg)] hover:shadow-lg'
          }`}
        >
          <nav aria-label={ariaLabel} className="flex w-[var(--spacing-rail-lg)] flex-col gap-1 p-2">
            {items(pinned ? '' : 'hidden group-hover/rail:block', !pinned)}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex nav:hidden" role="dialog" aria-modal="true" aria-label={ariaLabel}>
          <div className="absolute inset-0 bg-fg/25" onClick={() => setDrawer(false)} />
          <div className="rise relative flex w-64 shrink-0 flex-col border-r border-line bg-surface shadow-lg">
            <div className="flex h-[var(--spacing-header)] shrink-0 items-center justify-between border-b border-line px-2">
              <span className="text-xs font-semibold text-fg">Navigasi</span>
              <Button size="icon" icon={X} label="Tutup menu" onClick={() => setDrawer(false)} />
            </div>
            <nav aria-label={ariaLabel} className="flex flex-col gap-1 p-2">
              {items('', false)}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

/** Page title row: the one place a view names itself and carries toolbar actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-[var(--spacing-toolbar)] shrink-0 items-center gap-3 overflow-x-auto border-b border-line bg-surface px-4">
      <div className="shrink-0">
        <h1 className="text-sm font-semibold leading-none text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-2xs leading-none text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
