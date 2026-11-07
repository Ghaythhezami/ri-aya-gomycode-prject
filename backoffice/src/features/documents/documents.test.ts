import { DOCUMENT_POLL_MS, pollIntervalFor } from './polling';
import { MAX_DOCUMENT_BYTES, validateDocumentFile } from './validation';

describe('pollIntervalFor', () => {
  it('polls every 3 s while a document is pending or processing', () => {
    expect(pollIntervalFor([{ status: 'READY' }, { status: 'PROCESSING' }])).toBe(DOCUMENT_POLL_MS);
    expect(pollIntervalFor([{ status: 'PENDING' }])).toBe(3000);
  });

  it('stops when everything is settled or there is no data', () => {
    expect(pollIntervalFor([{ status: 'READY' }, { status: 'FAILED' }])).toBe(0);
    expect(pollIntervalFor([])).toBe(0);
    expect(pollIntervalFor(undefined)).toBe(0);
  });
});

describe('validateDocumentFile', () => {
  it('accepts PDF, JPEG and PNG up to 10 MB', () => {
    expect(validateDocumentFile({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(validateDocumentFile({ type: 'image/jpeg', size: MAX_DOCUMENT_BYTES })).toBeNull();
    expect(validateDocumentFile({ type: 'image/png', size: 5 })).toBeNull();
  });

  it('rejects other types, empty and oversized files', () => {
    expect(validateDocumentFile({ type: 'text/plain', size: 10 })).toBe('type');
    expect(validateDocumentFile({ type: 'image/gif', size: 10 })).toBe('type');
    expect(validateDocumentFile({ type: 'application/pdf', size: 0 })).toBe('empty');
    expect(validateDocumentFile({ type: 'application/pdf', size: MAX_DOCUMENT_BYTES + 1 })).toBe(
      'size',
    );
  });
});
