import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Extra class for the panel width, e.g. 'max-w-2xl'. */
  size?: string;
}

/**
 * Centered dialog with dimmed backdrop. Closes on Esc or backdrop click.
 * Mounted inline (no portal) — fine since the app is a single screen.
 */
export default function Modal({ open, onClose, title, subtitle, children, size = 'max-w-lg' }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`rise max-h-[88vh] w-full ${size} overflow-y-auto rounded-xl border border-line bg-ink-900/95 shadow-2xl`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-ink-900/95 px-5 py-3.5 backdrop-blur">
          <div>
            <h2 className="font-display text-sm tracking-[0.25em] text-gold-soft">{title}</h2>
            {subtitle && <p className="mt-1 text-[11px] text-mute">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Tutup"
            className="shrink-0 rounded border border-line px-2 py-1 text-xs text-mute transition-colors hover:border-gold/40 hover:text-fg"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
