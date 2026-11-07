import { z } from 'zod';
import { DOCUMENT_CATEGORIES } from '@riaya/shared';

/** What Claude returns for one uploaded document (structured output). */
export const extractionResultSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe('Date printed on the document, YYYY-MM-DD, or null when none is visible'),
  ocrText: z
    .string()
    .describe('Full text of the document, faithful to the original, no commentary'),
  clinicianSummary: z.string().describe('Short factual summary for the treating clinician'),
  title: z.string(),
  findings: z.array(z.string()),
  values: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      unit: z.string().nullable(),
      referenceRange: z.string().nullable(),
      flag: z.enum(['low', 'normal', 'high', 'abnormal']).nullable(),
    }),
  ),
  medications: z.array(
    z.object({
      name: z.string(),
      dose: z.string().nullable(),
      frequency: z.string().nullable(),
    }),
  ),
  patientSummary: z
    .string()
    .describe(
      'Plain-language summary for the patient: what the document says, no diagnosis, no advice',
    ),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** What Claude returns for a patient summary draft. */
export const summaryDraftSchema = z.object({
  content: z.string().describe('Clinician summary in markdown'),
  patientContent: z
    .string()
    .describe('Plain-language version for the patient; no diagnosis speculation'),
  sources: z.array(
    z.object({
      kind: z.enum(['appointment', 'document', 'note']),
      id: z.string(),
      label: z.string(),
    }),
  ),
});
export type SummaryDraftResult = z.infer<typeof summaryDraftSchema>;
