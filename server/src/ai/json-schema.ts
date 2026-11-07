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

function nullable(node: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(node.anyOf)) {
    const branches = node.anyOf as Array<Record<string, unknown>>;
    return branches.some((b) => b.type === 'null')
      ? node
      : { ...node, anyOf: [...branches, { type: 'null' }] };
  }
  const { description, ...rest } = node;
  return {
    ...(description !== undefined ? { description } : {}),
    anyOf: [rest, { type: 'null' }],
  };
}

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED.has(key)) continue;
    out[key] = clean(value);
  }
  if (out.type === 'object' || out.properties) {
    out.additionalProperties = false;
    // Optional properties become required-but-nullable: under strict decoding the model
    // reliably fills a required key, whereas optional keys were being left out entirely.
    const properties = out.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      const required = new Set((out.required as string[] | undefined) ?? []);
      for (const [name, prop] of Object.entries(properties)) {
        if (!required.has(name)) properties[name] = nullable(prop);
      }
      out.required = Object.keys(properties);
    }
  }
  return out;
}

/**
 * Zod schema to the JSON Schema the Claude API accepts for `strict: true` tools and
 * `output_config.format`: `additionalProperties: false` on every object, every property
 * required (optional ones as `T | null`) and no numeric or length bounds (those stay enforced
 * by the zod validation that runs on every tool input, after `stripNulls`).
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  return clean(raw) as Record<string, unknown>;
}

/** Drops `null` object values so the zod `.optional()` fields see `undefined`. */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== null) out[key] = stripNulls(v);
  }
  return out;
}
