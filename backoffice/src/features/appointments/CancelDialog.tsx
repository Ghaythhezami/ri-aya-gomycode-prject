import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { Textarea } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useErrorText } from './useActions';

/**
 * Cancellation with a required reason (APP-1). The text is kept when the API
 * refuses (for example 409 CANCELLATION_POLICY) so nothing the user typed is lost.
 */
export function CancelDialog({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal re-focuses whenever `onClose` changes, so hand it a stable function.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const stableClose = useCallback(() => closeRef.current(), []);

  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    } else {
      setReason('');
    }
  }, [open]);

  async function submit() {
    if (!reason.trim()) {
      setError(t('appointments.cancel.reasonRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (raw) {
      setError(errorText(raw));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={stableClose}
      actions={
        <>
          <Button variant="secondary" onClick={stableClose} disabled={busy}>
            {t('appointments.cancel.keep')}
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description ? <p className="mb-3">{description}</p> : null}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-text">
          {t('appointments.cancel.reason')}
        </span>
        <Textarea
          rows={3}
          maxLength={500}
          value={reason}
          invalid={Boolean(error) && !reason.trim()}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div aria-live="polite">
        {error ? (
          <p role="alert" className="mt-2 text-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
