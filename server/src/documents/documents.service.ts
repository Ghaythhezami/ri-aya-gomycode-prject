import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PatientDocumentDetail, PatientDocumentDto } from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { DocumentProcessorService } from './document-processor.service';
import {
  detectMime,
  MAX_DOCUMENT_BYTES,
  safeFileName,
  sha256,
  type UploadedDocumentFile,
} from './document-file';
import {
  toDocumentDetail,
  toDocumentDto,
  toPatientFacingDto,
  type DocumentRow,
} from './document-mappers';
import { PATIENT_VISIBLE_DOCUMENTS } from './patient-visibility';

/** Every column except the file bytes. */
const DOC_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedBy: true,
  status: true,
  category: true,
  documentDate: true,
  summary: true,
  extraction: true,
  extractedText: true,
  errorCode: true,
  reviewedAt: true,
  createdAt: true,
} as const;

function invalid(message: string) {
  return new UnprocessableEntityException({ code: 'DOCUMENT_INVALID', message });
}

function notFound() {
  return new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
}

/** Per patient: at most this many documents in total and this many bytes per rolling 24 hours. */
export const MAX_PATIENT_DOCUMENTS = 20;
export const MAX_PATIENT_BYTES_PER_DAY = 50 * 1024 * 1024;

/**
 * 429 with its own code. The portal controller answers it directly: the global filter maps every
 * other 429 to RATE_LIMITED.
 */
export class QuotaExceededException extends HttpException {
  constructor(details: Record<string, unknown>) {
    super(
      { code: 'QUOTA_EXCEEDED', message: 'Upload limit reached for now', details },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface UploadParams {
  clinicId: string;
  patientId: string;
  uploadedBy: 'STAFF' | 'PATIENT';
  /** Staff user id or patient account id. */
  uploaderId: string;
  /** Staff user id for the audit row (null for patients). */
  auditUserId: string | null;
  file: UploadedDocumentFile | undefined;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly processor: DocumentProcessorService,
  ) {}

  /** 404 unless the patient belongs to the clinic. */
  async assertPatient(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Patient not found' });
  }

  async upload(p: UploadParams): Promise<PatientDocumentDto> {
    await this.assertPatient(p.clinicId, p.patientId);
    const file = p.file;
    if (!file?.buffer?.length) throw invalid('Upload a PDF, JPEG or PNG file of up to 10 MB');
    if (file.buffer.length > MAX_DOCUMENT_BYTES) throw invalid('The file is larger than 10 MB');
    const mimeType = detectMime(file.buffer);
    if (!mimeType) throw invalid('Only PDF, JPEG and PNG files are accepted');

    const digest = sha256(file.buffer);
    const existing = await this.prisma.patientDocument.findFirst({
      where: { patientId: p.patientId, clinicId: p.clinicId, sha256: digest },
      select: { id: true },
    });
    if (existing) throw this.duplicate(existing.id);

    let created: DocumentRow & { id: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.patientDocument.create({
          data: {
            clinicId: p.clinicId,
            patientId: p.patientId,
            uploadedBy: p.uploadedBy,
            uploaderId: p.uploaderId,
            fileName: safeFileName(file.originalname),
            mimeType,
            sizeBytes: file.buffer.length,
            sha256: digest,
            content: new Uint8Array(file.buffer),
          },
          select: DOC_SELECT,
        });
        await this.audit.record(tx, {
          actorUserId: p.auditUserId,
          clinicId: p.clinicId,
          action: 'create',
          entity: 'patient_document',
          entityId: row.id,
          after: {
            patientId: p.patientId,
            uploadedBy: p.uploadedBy,
            mimeType,
            sizeBytes: row.sizeBytes,
            sha256: digest,
          },
        });
        return row;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const again = await this.prisma.patientDocument.findFirst({
          where: { patientId: p.patientId, clinicId: p.clinicId, sha256: digest },
          select: { id: true },
        });
        if (again) throw this.duplicate(again.id);
      }
      throw error;
    }

    await this.processor.dispatch(created.id, p.clinicId);
    // Inline processing (Vercel without waitUntil) already finished: return the fresh state.
    const fresh = await this.prisma.patientDocument.findFirst({
      where: { id: created.id, clinicId: p.clinicId },
      select: DOC_SELECT,
    });
    return toDocumentDto(fresh ?? created);
  }

  private duplicate(documentId: string) {
    return new ConflictException({
      code: 'DUPLICATE_DOCUMENT',
      message: 'This file was already uploaded for this patient',
      details: { documentId },
    });
  }

  async list(clinicId: string, patientId: string): Promise<PatientDocumentDto[]> {
    await this.assertPatient(clinicId, patientId);
    const rows = await this.prisma.patientDocument.findMany({
      where: { clinicId, patientId },
      select: DOC_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toDocumentDto);
  }

  async detail(clinicId: string, patientId: string, id: string): Promise<PatientDocumentDetail> {
    const row = await this.prisma.patientDocument.findFirst({
      where: { id, clinicId, patientId },
      select: DOC_SELECT,
    });
    if (!row) throw notFound();
    return toDocumentDetail(row);
  }

  async file(clinicId: string, patientId: string, id: string) {
    const row = await this.prisma.patientDocument.findFirst({
      where: { id, clinicId, patientId },
      select: { fileName: true, mimeType: true, content: true },
    });
    if (!row) throw notFound();
    return row;
  }

  async remove(
    clinicId: string,
    patientId: string,
    id: string,
    auditUserId: string,
  ): Promise<{ success: true }> {
    const row = await this.prisma.patientDocument.findFirst({
      where: { id, clinicId, patientId },
      select: { id: true, mimeType: true, sizeBytes: true },
    });
    if (!row) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.patientDocument.delete({ where: { id } });
      await this.audit.record(tx, {
        actorUserId: auditUserId,
        clinicId,
        action: 'delete',
        entity: 'patient_document',
        entityId: id,
        before: { patientId, mimeType: row.mimeType, sizeBytes: row.sizeBytes },
      });
    });
    return { success: true };
  }

  async review(
    clinicId: string,
    patientId: string,
    id: string,
    userId: string,
  ): Promise<PatientDocumentDetail> {
    const row = await this.prisma.patientDocument.findFirst({
      where: { id, clinicId, patientId },
      select: { id: true },
    });
    if (!row) throw notFound();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.patientDocument.update({
        where: { id },
        data: { reviewedAt: new Date(), reviewedById: userId },
        select: DOC_SELECT,
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        clinicId,
        action: 'update',
        entity: 'patient_document',
        entityId: id,
        after: { patientId, reviewed: true },
      });
      return next;
    });
    return toDocumentDetail(updated);
  }

  /** Re-run the extraction (after FAILED, or to refresh a READY one). */
  async reprocess(clinicId: string, patientId: string, id: string): Promise<PatientDocumentDetail> {
    const row = await this.prisma.patientDocument.findFirst({
      where: { id, clinicId, patientId },
      select: { id: true, status: true },
    });
    if (!row) throw notFound();
    if (row.status !== 'PROCESSING') {
      await this.prisma.patientDocument.update({
        where: { id },
        data: { status: 'PENDING', errorCode: null },
      });
    }
    await this.processor.dispatch(id, clinicId);
    return this.detail(clinicId, patientId, id);
  }

  /** The patient's own view: their uploads plus clinician-reviewed documents, no extracted text. */
  async listForPatient(clinicId: string, patientId: string): Promise<PatientDocumentDto[]> {
    const rows = await this.prisma.patientDocument.findMany({
      where: { clinicId, patientId, ...PATIENT_VISIBLE_DOCUMENTS },
      select: DOC_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toPatientFacingDto);
  }

  private async assertQuota(clinicId: string, patientId: string, incomingBytes: number) {
    const total = await this.prisma.patientDocument.count({ where: { clinicId, patientId } });
    if (total >= MAX_PATIENT_DOCUMENTS) {
      throw new QuotaExceededException({ limit: MAX_PATIENT_DOCUMENTS, scope: 'documents' });
    }
    const since = new Date(Date.now() - 24 * 3600_000);
    const agg = await this.prisma.patientDocument.aggregate({
      where: { clinicId, patientId, createdAt: { gt: since } },
      _sum: { sizeBytes: true },
    });
    if ((agg._sum.sizeBytes ?? 0) + incomingBytes > MAX_PATIENT_BYTES_PER_DAY) {
      throw new QuotaExceededException({ limitBytes: MAX_PATIENT_BYTES_PER_DAY, scope: 'bytes' });
    }
  }

  async uploadForPatient(
    principal: { clinicId: string; patientId: string; accountId: string },
    file: UploadedDocumentFile | undefined,
  ): Promise<PatientDocumentDto> {
    // `emailVerifiedAt` is the "identity verified by the clinic" timestamp (set for invite
    // accounts and by staff); self-registered accounts cannot upload until then.
    const account = await this.prisma.patientAccount.findFirst({
      where: { id: principal.accountId, clinicId: principal.clinicId },
      select: { emailVerifiedAt: true },
    });
    if (!account?.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'VERIFICATION_REQUIRED',
        message: 'The clinic needs to confirm your identity first',
      });
    }
    await this.assertQuota(principal.clinicId, principal.patientId, file?.buffer?.length ?? 0);
    const dto = await this.upload({
      clinicId: principal.clinicId,
      patientId: principal.patientId,
      uploadedBy: 'PATIENT',
      uploaderId: principal.accountId,
      auditUserId: null,
      file,
    });
    return { ...dto, summary: null, extraction: null };
  }
}
