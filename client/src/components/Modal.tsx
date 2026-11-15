import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

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
  // Callers pass an inline onClose, so it changes every render — keeping it in
  // the effect deps would re-run the effect (and steal focus) on every keystroke.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/25 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`rise flex max-h-[88vh] w-full ${size} flex-col overflow-hidden rounded-xl border border-line bg-white shadow-lg`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Tutup"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
