import { z } from 'zod';

/** JSON Schema keywords the strict / structured-output grammar does not accept. */
const UNSUPPORTED = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'default',
  'examples',
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED.has(key)) continue;
    out[key] = clean(value);
  }
  if (out.type === 'object' || out.properties) out.additionalProperties = false;
  return out;
}

/**
 * Zod schema to the JSON Schema the Claude API accepts for `strict: true` tools and
 * `output_config.format`: `additionalProperties: false` on every object and no numeric or
 * length bounds (those stay enforced by the zod validation that runs on every tool input).
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  return clean(raw) as Record<string, unknown>;
}
