import { z } from 'zod';
import { stripNulls, toStrictJsonSchema } from './json-schema';

describe('toStrictJsonSchema', () => {
  const schema = z.object({
    doctorId: z.string().optional(),
    specialty: z.string().describe('Specialty name').optional(),
    fromDate: z.string(),
    days: z.number().int().min(1).max(14).optional(),
    nested: z.object({ note: z.string().optional() }).optional(),
  });

  it('makes every property required and optional ones nullable', () => {
    const json = toStrictJsonSchema(schema) as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, Record<string, unknown>>;
    };
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(['doctorId', 'specialty', 'fromDate', 'days', 'nested']);
    expect(json.properties.fromDate).toEqual({ type: 'string' });
    expect(json.properties.doctorId).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(json.properties.specialty).toEqual({
      description: 'Specialty name',
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
    // Numeric bounds are dropped for the API (zod still enforces them).
    expect(json.properties.days).toEqual({ anyOf: [{ type: 'integer' }, { type: 'null' }] });
    const nested = (json.properties.nested!.anyOf as Array<Record<string, unknown>>)[0]!;
    expect(nested.required).toEqual(['note']);
    expect(nested.additionalProperties).toBe(false);
  });

  it('round-trips a model answer with nulls through zod', () => {
    const answer = {
      doctorId: null,
      specialty: 'Cardiology',
      fromDate: '2026-11-09',
      days: null,
      nested: { note: null },
    };
    const parsed = schema.safeParse(stripNulls(answer));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ specialty: 'Cardiology', fromDate: '2026-11-09', nested: {} });
  });

  it('keeps arrays and non-null values intact', () => {
    expect(stripNulls({ a: [1, null, { b: null, c: 2 }], d: 0, e: false, f: '' })).toEqual({
      a: [1, null, { c: 2 }],
      d: 0,
      e: false,
      f: '',
    });
  });
});
