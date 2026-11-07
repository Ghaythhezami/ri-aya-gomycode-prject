import type {
  DocumentCategory,
  DocumentExtraction,
  DocumentStatus,
  PatientDocumentDetail,
  PatientDocumentDto,
} from '@riaya/shared';

export interface DocumentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  status: string;
  category: string | null;
  documentDate: Date | null;
  summary: string | null;
  extraction: unknown;
  extractedText: string | null;
  errorCode?: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

function asExtraction(value: unknown): DocumentExtraction | null {
  if (!value || typeof value !== 'object') return null;
  return value as DocumentExtraction;
}

export function toDocumentDto(row: DocumentRow): PatientDocumentDto {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy === 'PATIENT' ? 'PATIENT' : 'STAFF',
    status: row.status as DocumentStatus,
    category: (row.category as DocumentCategory | null) ?? null,
    documentDate: row.documentDate ? row.documentDate.toISOString().slice(0, 10) : null,
    summary: row.summary,
    extraction: asExtraction(row.extraction),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDocumentDetail(row: DocumentRow): PatientDocumentDetail {
  return { ...toDocumentDto(row), extractedText: row.extractedText };
}

/**
 * Patient-facing view: no extracted text, no clinician summary, no raw values. The
 * plain-language summary appears only after a clinician reviewed the document.
 */
export function toPatientFacingDto(row: DocumentRow): PatientDocumentDto {
  const dto = toDocumentDto(row);
  const patientSummary =
    row.reviewedAt && row.status === 'READY'
      ? (asExtraction(row.extraction)?.patientSummary ?? null)
      : null;
  return { ...dto, summary: patientSummary, extraction: null };
}
