import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: traps focus, closes on Escape, hides the background from
 * assistive tech and restores focus to the element that opened it (NFR-004).
 */
export function Modal({
  open,
  title,
  children,
  onClose,
  actions,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // Move focus into the dialog so the trap starts inside it.
    (focusables()[0] ?? panel)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    };

    // Inert the rest of the page so screen readers and Tab cannot escape the dialog.
    const root = document.getElementById('root');
    const appShell = root?.firstElementChild as HTMLElement | null;
    const inertTargets = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.contains(panel),
    );
    if (root && appShell) inertTargets.push(appShell);

    const previousAriaHidden = inertTargets.map((el) => el.getAttribute('aria-hidden'));
    inertTargets.forEach((el) => el.setAttribute('aria-hidden', 'true'));

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      inertTargets.forEach((el, index) => {
        const previous = previousAriaHidden[index];
        if (previous === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', previous);
      });
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-navy/40"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-(--shadow-card)"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="text-lg font-semibold text-text">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-muted">{children}</div>
        {actions ? <div className="mt-6 flex justify-end gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
