import { DocumentProcessorService } from './document-processor.service';
import { detectMime, sha256 } from './document-file';
import { DocumentsService } from './documents.service';
import { toPatientFacingDto } from './document-mappers';
import { SummariesService } from './summaries.service';
import { StructuredOutputError } from '../ai/structured-output.service';

const pdf = Buffer.from('%PDF-1.7 fake body');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const file = (buffer: Buffer, name = 'scan.pdf') => ({
  originalname: name,
  mimetype: 'application/octet-stream',
  size: buffer.length,
  buffer,
});

const docRow = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  fileName: 'scan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  uploadedBy: 'STAFF',
  status: 'PENDING',
  category: null,
  documentDate: null,
  summary: null,
  extraction: null,
  extractedText: null,
  errorCode: null,
  reviewedAt: null,
  createdAt: new Date('2026-11-07T00:00:00Z'),
  ...over,
});

describe('detectMime', () => {
  it('recognises PDF, JPEG and PNG by magic bytes and nothing else', () => {
    expect(detectMime(pdf)).toBe('application/pdf');
    expect(detectMime(jpeg)).toBe('image/jpeg');
    expect(detectMime(png)).toBe('image/png');
    expect(detectMime(Buffer.from('MZ\x90\x00 an exe renamed to .pdf'))).toBeNull();
    expect(detectMime(Buffer.from('<html>'))).toBeNull();
    expect(detectMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('DocumentsService.upload', () => {
  function build(over: { patient?: unknown; existing?: unknown } = {}) {
    const tx = {
      patientDocument: { create: jest.fn().mockResolvedValue(docRow()) },
    };
    const prisma = {
      patient: {
        findFirst: jest
          .fn()
          .mockResolvedValue(over.patient === undefined ? { id: 'p1' } : over.patient),
      },
      patientDocument: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(over.existing ?? null)
          .mockResolvedValue(docRow({ status: 'PROCESSING' })),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const processor = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentsService(prisma as never, audit as never, processor as never);
    return { service, prisma, tx, audit, processor };
  }

  const params = (f: ReturnType<typeof file> | undefined) => ({
    clinicId: 'clinic-1',
    patientId: 'p1',
    uploadedBy: 'STAFF' as const,
    uploaderId: 'u1',
    auditUserId: 'u1',
    file: f,
  });

  it('rejects a file whose bytes are not PDF, JPEG or PNG with 422 DOCUMENT_INVALID', async () => {
    const { service, tx } = build();
    await expect(
      service.upload(params(file(Buffer.from('MZ not a pdf'), 'x.pdf'))),
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: 'DOCUMENT_INVALID' }),
    });
    await expect(service.upload(params(undefined))).rejects.toMatchObject({ status: 422 });
    expect(tx.patientDocument.create).not.toHaveBeenCalled();
  });

  it('answers 409 with the existing id for the same bytes of the same patient', async () => {
    const { service } = build({ existing: { id: 'doc-old' } });
    await expect(service.upload(params(file(pdf)))).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ details: { documentId: 'doc-old' } }),
    });
  });

  it('stores the file with the type taken from its bytes, audits it and starts processing', async () => {
    const { service, tx, audit, processor, prisma } = build();
    const dto = await service.upload(params(file(png, '../../evil.pdf')));
    const data = tx.patientDocument.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      clinicId: 'clinic-1',
      patientId: 'p1',
      uploadedBy: 'STAFF',
      mimeType: 'image/png',
      fileName: 'evil.pdf',
      sha256: sha256(png),
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entity: 'patient_document',
        action: 'create',
        clinicId: 'clinic-1',
      }),
    );
    expect(processor.dispatch).toHaveBeenCalledWith('doc-1', 'clinic-1');
    expect(dto.status).toBe('PROCESSING');
    // The dedupe lookup is scoped by clinic and patient.
    expect(prisma.patientDocument.findFirst.mock.calls[0]![0].where).toMatchObject({
      clinicId: 'clinic-1',
      patientId: 'p1',
    });
  });

  it('answers 404 for a patient of another clinic', async () => {
    const { service, prisma } = build({ patient: null });
    await expect(service.upload(params(file(pdf)))).rejects.toMatchObject({ status: 404 });
    expect(prisma.patient.findFirst.mock.calls[0]![0].where).toMatchObject({
      clinicId: 'clinic-1',
    });
  });
});

describe('DocumentsService.uploadForPatient', () => {
  const principal = { clinicId: 'clinic-1', patientId: 'p1', accountId: 'acc-1' };

  function build(over: { verified?: boolean; total?: number; bytes?: number } = {}) {
    const tx = { patientDocument: { create: jest.fn().mockResolvedValue(docRow()) } };
    const prisma = {
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
      patientAccount: {
        findFirst: jest.fn().mockResolvedValue({
          emailVerifiedAt: (over.verified ?? true) ? new Date() : null,
        }),
      },
      patientDocument: {
        count: jest.fn().mockResolvedValue(over.total ?? 0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: over.bytes ?? 0 } }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const processor = { dispatch: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new DocumentsService(prisma as never, audit as never, processor as never),
      prisma,
      tx,
    };
  }

  it('refuses an unverified account with 403 VERIFICATION_REQUIRED', async () => {
    const { service, tx } = build({ verified: false });
    await expect(service.uploadForPatient(principal, file(pdf))).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'VERIFICATION_REQUIRED' }),
    });
    expect(tx.patientDocument.create).not.toHaveBeenCalled();
  });

  it('answers 429 QUOTA_EXCEEDED beyond 20 documents', async () => {
    const { service } = build({ total: 20 });
    await expect(service.uploadForPatient(principal, file(pdf))).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ code: 'QUOTA_EXCEEDED' }),
    });
  });

  it('answers 429 QUOTA_EXCEEDED beyond 50 MB in 24 hours and reads the rolling window', async () => {
    const { service, prisma } = build({ bytes: 50 * 1024 * 1024 - 1 });
    await expect(service.uploadForPatient(principal, file(pdf))).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ code: 'QUOTA_EXCEEDED' }),
    });
    const where = prisma.patientDocument.aggregate.mock.calls[0]![0].where;
    expect(where.createdAt.gt.getTime()).toBeLessThan(Date.now() - 23 * 3600_000);
  });

  it('accepts an upload within the quotas', async () => {
    const { service } = build({ total: 19, bytes: 1000 });
    await expect(service.uploadForPatient(principal, file(pdf))).resolves.toBeDefined();
  });
});

describe('patient-facing documents', () => {
  it('hides extracted text, clinician summary and values; summary only after review', () => {
    const row = docRow({
      status: 'READY',
      summary: 'clinician only',
      extractedText: 'full ocr',
      extraction: {
        title: 't',
        findings: ['f'],
        values: [],
        medications: [],
        patientSummary: 'plain',
      },
    });
    const before = toPatientFacingDto(row as never);
    expect(before).not.toHaveProperty('extractedText');
    expect(before.summary).toBeNull();
    expect(before.extraction).toBeNull();
    const after = toPatientFacingDto({ ...row, reviewedAt: new Date() } as never);
    expect(after.summary).toBe('plain');
    expect(JSON.stringify(after)).not.toContain('clinician only');
    expect(JSON.stringify(after)).not.toContain('full ocr');
  });
});

describe('DocumentProcessorService', () => {
  const result = {
    category: 'lab_result' as const,
    documentDate: '2026-10-30',
    ocrText: 'Hemoglobin 13.5 g/dL',
    clinicianSummary: 'CBC within range.',
    title: 'CBC',
    findings: ['No anomalies'],
    values: [
      {
        name: 'Hemoglobin',
        value: '13.5',
        unit: 'g/dL',
        referenceRange: '12-16',
        flag: 'normal' as const,
      },
    ],
    medications: [],
    patientSummary: 'Your blood count looks normal.',
  };

  function build(
    structured: Record<string, unknown>,
    claimed = 1,
    over: { aiEnabled?: boolean; uploadedBy?: string; consent?: boolean } = {},
  ) {
    const prisma = {
      clinicSettings: {
        findUnique: jest.fn().mockResolvedValue({ aiAssistantsEnabled: over.aiEnabled ?? true }),
      },
      patientDocument: {
        updateMany: jest.fn().mockResolvedValue({ count: claimed }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'doc-1',
          patientId: 'p1',
          uploadedBy: over.uploadedBy ?? 'STAFF',
          mimeType: 'application/pdf',
          content: new Uint8Array(pdf),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      patientAccount: {
        findFirst: jest.fn().mockResolvedValue({
          preferredLocale: 'fr',
          aiConsentAt: (over.consent ?? true) ? new Date() : null,
        }),
      },
    };
    const settings = { get: jest.fn().mockResolvedValue({ defaultLanguage: 'en' }) };
    const service = new DocumentProcessorService(
      prisma as never,
      structured as never,
      settings as never,
    );
    return { service, prisma };
  }

  it('does not send the file to Claude when the clinic switched the assistants off (FAILED AI_DISABLED)', async () => {
    const run = jest.fn();
    const { service, prisma } = build({ enabled: true, run }, 1, { aiEnabled: false });
    await service.process('doc-1', 'clinic-1');
    expect(run).not.toHaveBeenCalled();
    expect(prisma.patientDocument.update.mock.calls[0]![0].data).toEqual({
      status: 'FAILED',
      errorCode: 'AI_DISABLED',
    });
  });

  it('does not send a patient-uploaded file without the patient AI consent (FAILED CONSENT_REQUIRED)', async () => {
    const run = jest.fn().mockResolvedValue(result);
    const noConsent = build({ enabled: true, run }, 1, { uploadedBy: 'PATIENT', consent: false });
    await noConsent.service.process('doc-1', 'clinic-1');
    expect(run).not.toHaveBeenCalled();
    expect(noConsent.prisma.patientDocument.update.mock.calls[0]![0].data).toEqual({
      status: 'FAILED',
      errorCode: 'CONSENT_REQUIRED',
    });
    // With consent it is processed; staff uploads never need the patient's consent.
    await build({ enabled: true, run }, 1, { uploadedBy: 'PATIENT' }).service.process('d', 'c');
    await build({ enabled: true, run }, 1, { consent: false }).service.process('d', 'c');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('persists the structured extraction and marks the document READY', async () => {
    const run = jest.fn().mockResolvedValue(result);
    const { service, prisma } = build({ enabled: true, run });
    await service.process('doc-1', 'clinic-1');

    const call = run.mock.calls[0]![0];
    expect(call.clinicId).toBe('clinic-1');
    expect(call.content[0]).toMatchObject({
      type: 'document',
      source: { media_type: 'application/pdf' },
    });
    expect(call.content[1].text).toContain('French');
    expect(prisma.patientDocument.updateMany.mock.calls[0]![0].where).toMatchObject({
      id: 'doc-1',
      clinicId: 'clinic-1',
    });
    const update = prisma.patientDocument.update.mock.calls[0]![0];
    expect(update.data).toMatchObject({
      status: 'READY',
      errorCode: null,
      category: 'lab_result',
      extractedText: 'Hemoglobin 13.5 g/dL',
      summary: 'CBC within range.',
      extraction: { title: 'CBC', patientSummary: 'Your blood count looks normal.' },
    });
    expect(update.data.documentDate).toEqual(new Date('2026-10-30T00:00:00Z'));
  });

  it('marks FAILED with the error code when the model refuses or is unavailable', async () => {
    const refuse = build({
      enabled: true,
      run: jest.fn().mockRejectedValue(new StructuredOutputError('AI_REFUSED')),
    });
    await refuse.service.process('doc-1', 'clinic-1');
    expect(refuse.prisma.patientDocument.update.mock.calls[0]![0].data).toEqual({
      status: 'FAILED',
      errorCode: 'AI_REFUSED',
    });

    const off = build({ enabled: false, run: jest.fn() });
    await off.service.process('doc-1', 'clinic-1');
    expect(off.prisma.patientDocument.update.mock.calls[0]![0].data).toMatchObject({
      status: 'FAILED',
      errorCode: 'AI_UNAVAILABLE',
    });
  });

  it('does nothing when another worker already holds the document', async () => {
    const run = jest.fn();
    const { service, prisma } = build({ enabled: true, run }, 0);
    await service.process('doc-1', 'clinic-1');
    expect(run).not.toHaveBeenCalled();
    expect(prisma.patientDocument.update).not.toHaveBeenCalled();
  });

  it('processes inline when running on Vercel without waitUntil', async () => {
    const run = jest.fn().mockResolvedValue(result);
    const { service, prisma } = build({ enabled: true, run });
    process.env.VERCEL = '1';
    try {
      await service.dispatch('doc-1', 'clinic-1');
    } finally {
      delete process.env.VERCEL;
    }
    expect(prisma.patientDocument.update).toHaveBeenCalled(); // finished before dispatch returned
  });
});

describe('SummariesService', () => {
  function build(over: { current?: unknown; run?: jest.Mock } = {}) {
    const tx = {
      patientSummary: {
        create: jest.fn((a: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 's1', createdAt: new Date(), ...a.data }),
        ),
        update: jest.fn((a: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...(over.current as object),
            ...a.data,
          }),
        ),
      },
    };
    const prisma = {
      patient: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          firstName: 'Ann',
          lastName: 'Lee',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'female',
          clinicalNotes: 'Seasonal allergy.',
        }),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ap1',
            code: 'AP-1',
            startsAt: new Date('2026-05-01T09:00:00Z'),
            status: 'COMPLETED',
            type: 'CONSULTATION',
            reason: null,
          },
        ]),
      },
      patientDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'doc-1',
            fileName: 'cbc.pdf',
            category: 'lab_result',
            documentDate: null,
            summary: 's',
            extraction: {},
          },
        ]),
      },
      patientSummary: {
        findFirst: jest.fn().mockResolvedValue(over.current ?? null),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', firstName: 'Dr', lastName: 'House' }]),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const structured = {
      enabled: true,
      run:
        over.run ??
        jest.fn().mockResolvedValue({
          content: '## Summary',
          patientContent: 'Plain words',
          sources: [
            { kind: 'appointment', id: 'ap1', label: 'Visit' },
            { kind: 'document', id: 'foreign-doc', label: 'Not this patient' },
            { kind: 'note', id: 'p1', label: 'Notes' },
          ],
        }),
    };
    const settings = {
      get: jest.fn().mockResolvedValue({ clinic: { timezone: 'UTC' }, defaultLanguage: 'en' }),
    };
    const service = new SummariesService(
      prisma as never,
      audit as never,
      structured as never,
      settings as never,
    );
    return { service, prisma, tx, audit, structured };
  }

  it('drafts from this clinic and patient only and drops sources it did not provide', async () => {
    const { service, prisma, structured } = build();
    const draft = await service.draft('clinic-1', 'p1');

    expect(prisma.patient.findFirst.mock.calls[0]![0].where).toEqual({
      id: 'p1',
      clinicId: 'clinic-1',
    });
    expect(prisma.appointment.findMany.mock.calls[0]![0].where).toMatchObject({
      clinicId: 'clinic-1',
      patientId: 'p1',
    });
    expect(prisma.patientDocument.findMany.mock.calls[0]![0].where).toEqual({
      clinicId: 'clinic-1',
      patientId: 'p1',
      status: 'READY',
    });
    expect(structured.run.mock.calls[0]![0].clinicId).toBe('clinic-1');
    expect(draft.sources).toEqual([
      { kind: 'appointment', id: 'ap1', label: 'Visit' },
      { kind: 'note', id: 'p1', label: 'Notes' },
    ]);
    expect(draft.patientContent).toBe('Plain words');
  });

  it('answers 404 for a patient of another clinic', async () => {
    const t = build();
    t.prisma.patient.findFirst.mockResolvedValueOnce(null);
    await expect(t.service.draft('clinic-2', 'p1')).rejects.toMatchObject({ status: 404 });
  });

  it('saving with visibleToPatient sets publishedAt; without it the summary stays private', async () => {
    const t = build();
    const shared = await t.service.save('clinic-1', 'p1', 'u1', {
      content: 'c',
      patientContent: 'plain',
      visibleToPatient: true,
    });
    expect(shared.visibleToPatient).toBe(true);
    expect(shared.publishedAt).not.toBeNull();
    const priv = await t.service.save('clinic-1', 'p1', 'u1', { content: 'c' });
    expect(priv.publishedAt).toBeNull();
    expect(t.audit.record).toHaveBeenCalledTimes(2);
    await expect(
      t.service.save('clinic-1', 'p1', 'u1', { content: 'c', visibleToPatient: true }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('publish sets publishedAt and unpublish clears it', async () => {
    const current = {
      id: 's1',
      clinicId: 'clinic-1',
      patientId: 'p1',
      authorId: 'u1',
      content: 'c',
      patientContent: 'plain',
      sources: [],
      visibleToPatient: false,
      publishedAt: null,
      createdAt: new Date(),
    };
    const t = build({ current });
    const published = await t.service.update('clinic-1', 'p1', 's1', 'u1', {
      visibleToPatient: true,
    });
    expect(published.publishedAt).not.toBeNull();
    expect(t.prisma.patientSummary.findFirst.mock.calls[0]![0].where).toEqual({
      id: 's1',
      clinicId: 'clinic-1',
      patientId: 'p1',
    });

    const t2 = build({ current: { ...current, visibleToPatient: true, publishedAt: new Date() } });
    const unpublished = await t2.service.update('clinic-1', 'p1', 's1', 'u1', {
      visibleToPatient: false,
    });
    expect(unpublished.publishedAt).toBeNull();
    expect(unpublished.visibleToPatient).toBe(false);
  });
});
