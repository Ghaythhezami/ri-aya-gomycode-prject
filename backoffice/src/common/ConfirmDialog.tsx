import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * Confirmation built on {@link Modal}, so it inherits the focus trap and the
 * focus restoration to the invoking element on cancel (FR-005, EC-008).
 *
 * `tone="danger"` renders the confirm action in the error style but never
 * changes the wording on its own — the caller supplies destructive copy, which
 * keeps the consequence explicit rather than implied by colour.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
