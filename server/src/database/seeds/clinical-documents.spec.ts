import { extractionResultSchema } from '../../documents/document-schemas';
import { buildExtraction, renderDocumentLines, STORIES } from './clinical-documents';
import { buildMinimalPdf } from './minimal-pdf';

const patient = {
  id: 'p1',
  code: 'P-0001',
  firstName: 'Test',
  lastName: 'Patient',
  dateOfBirth: new Date('1980-01-01T00:00:00Z'),
};

describe('clinical document stories', () => {
  it('has five stories with unique document keys', () => {
    expect(STORIES).toHaveLength(5);
    const keys = STORIES.flatMap((s) => s.documents.map((d) => d.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(STORIES.flatMap((s) => s.documents.map((d) => [d.key, d] as const)))(
    '%s renders a PDF and a schema-valid extraction',
    (_key, spec) => {
      const lines = renderDocumentLines(spec, patient, '2026-01-02');
      const ocr = lines.join('\n');
      const extraction = buildExtraction(spec, ocr, '2026-01-02');
      expect(extractionResultSchema.safeParse(extraction).success).toBe(true);
      expect(extraction.ocrText).toContain(patient.code);
      expect(spec.summary.length).toBeGreaterThan(40);
      const pdf = buildMinimalPdf(lines, spec.title).toString('latin1');
      expect(pdf.startsWith('%PDF-')).toBe(true);
      expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    },
  );
});
