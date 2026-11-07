import { createHash } from 'node:crypto';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type DocumentMime = 'application/pdf' | 'image/jpeg' | 'image/png';

/** The file type from its first bytes, never from the extension or the client's header. */
export function detectMime(buffer: Buffer): DocumentMime | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'application/pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  return null;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Base name without path parts or control characters, at most 200 characters. */
export function safeFileName(name: string | undefined): string {
  const base = (name ?? 'document').split(/[\\/]/).pop() ?? 'document';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f"<>|:*?]/g, '_').trim();
  return (cleaned || 'document').slice(0, 200);
}

/** The part of a multer file the documents module reads. */
export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
