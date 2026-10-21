import { useEffect, type ReactNode } from 'react';

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
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal
    >
      <button className="absolute inset-0 bg-navy/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-[16px] bg-white p-6 shadow-(--shadow-card)">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <div className="mt-3 text-sm leading-6 text-muted">{children}</div>
        {actions ? <div className="mt-6 flex justify-end gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
