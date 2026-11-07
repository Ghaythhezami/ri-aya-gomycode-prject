import type { DocumentStatus } from '@riaya/shared';

export const DOCUMENT_POLL_MS = 3000;

export function isInFlight(status: DocumentStatus): boolean {
  return status === 'PENDING' || status === 'PROCESSING';
}

/** Poll every 3 s while any document is still being processed, otherwise stop (0). */
export function pollIntervalFor(docs: readonly { status: DocumentStatus }[] | undefined): number {
  return docs?.some((d) => isInFlight(d.status)) ? DOCUMENT_POLL_MS : 0;
}

export const STATUS_TONE: Record<DocumentStatus, 'neutral' | 'info' | 'success' | 'error'> = {
  PENDING: 'neutral',
  PROCESSING: 'info',
  READY: 'success',
  FAILED: 'error',
};
