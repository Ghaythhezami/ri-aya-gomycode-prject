export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export type FileProblem = 'type' | 'size' | 'empty';

/** Client-side pre-check; the server re-checks magic bytes. */
export function validateDocumentFile(file: { type: string; size: number }): FileProblem | null {
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size <= 0) return 'empty';
  if (file.size > MAX_DOCUMENT_BYTES) return 'size';
  return null;
}
